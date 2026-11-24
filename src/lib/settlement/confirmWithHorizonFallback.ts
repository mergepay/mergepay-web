/**
 * Settlement confirmation with a direct-to-Horizon fallback (#814).
 *
 * The Mergepay API submits a signed settlement to Stellar and reports the
 * outcome on `GET /settlements/:id`. Under network congestion or a slow API,
 * that status can lag far behind the ledger — or never arrive, when the submit
 * request itself was lost after signing. This races the API poll against a
 * read-only Horizon poll of the signed envelope's hash
 * (`GET /transactions/{hash}`, exponential backoff, `Retry-After` honoured)
 * and settles with whichever reaches a terminal state first.
 *
 * Nothing here ever re-submits: both legs only read, so the race is safe to
 * run for a payment of unknown fate.
 */

import type { Settlement } from "../types";
import {
  pollTransactionStatus,
  TransactionPollingFailedError,
  type TransactionStatusResponse,
} from "../transactionStatusPolling";
import {
  SettlementAbortedError,
  SettlementTimeoutError,
  waitForSettlementConfirmation,
} from "../stellar/transactions";

export interface HorizonFallbackOptions {
  /**
   * How long the API gets on its own before Horizon is asked. Default 4s,
   * about one ledger close, so a healthy API answers first.
   */
  graceMs?: number;
  initialIntervalMs?: number;
  maxIntervalMs?: number;
  horizonUrl?: string;
  /** Test seam: replaces the Horizon `fetch`. */
  probe?: (txHash: string, signal?: AbortSignal) => Promise<TransactionStatusResponse>;
}

export interface ConfirmWithHorizonFallbackOptions {
  settlementId: string;
  fetchSettlement: (id: string) => Promise<Settlement>;
  /**
   * The settlement as the API described it before submission. A Horizon
   * verdict is reported on a copy of it, with `status` and `stellarTxHash`
   * filled in, so callers handle both sources the same way.
   */
  pending: Settlement;
  /** Hash of the signed envelope; without one only the API is polled. */
  txHash: string | null;
  signal?: AbortSignal;
  /** API poll cadence. */
  intervalMs?: number;
  /** Overall deadline for both legs. */
  timeoutMs?: number;
  /** `false` disables the Horizon leg entirely. */
  horizon?: HorizonFallbackOptions | false;
  /** Called once the grace period ends and Horizon is being polled. */
  onHorizonStart?: () => void;
}

export interface ConfirmWithHorizonFallbackResult {
  settlement: Settlement;
  /** Which leg answered first. */
  source: "api" | "horizon";
}

export const DEFAULT_HORIZON_GRACE_MS = 4000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new SettlementAbortedError());
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new SettlementAbortedError());
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Resolve with the first terminal (`confirmed` / `failed`) answer from the API
 * or Horizon. Rejects with `SettlementTimeoutError` when neither has one by
 * `timeoutMs` (the payment may still land: offer a status check, never a
 * re-send), and with `SettlementAbortedError` when `signal` aborts.
 */
export async function confirmWithHorizonFallback({
  settlementId,
  fetchSettlement,
  pending,
  txHash,
  signal,
  intervalMs = 2500,
  timeoutMs = 90_000,
  horizon = {},
  onHorizonStart,
}: ConfirmWithHorizonFallbackOptions): Promise<ConfirmWithHorizonFallbackResult> {
  if (signal?.aborted) throw new SettlementAbortedError();

  // One controller for both legs: the winner (or the caller) stops the other.
  const race = new AbortController();
  const onOuterAbort = () => race.abort();
  signal?.addEventListener("abort", onOuterAbort, { once: true });

  const apiLeg = waitForSettlementConfirmation({
    settlementId,
    fetchSettlement,
    signal: race.signal,
    intervalMs,
    timeoutMs,
  }).then((settlement): ConfirmWithHorizonFallbackResult => ({ settlement, source: "api" }));

  const graceMs = horizon ? (horizon.graceMs ?? DEFAULT_HORIZON_GRACE_MS) : 0;
  const horizonBudget = timeoutMs - graceMs;
  const legs: Promise<ConfirmWithHorizonFallbackResult>[] = [apiLeg];

  if (horizon && txHash && horizonBudget > 0) {
    const horizonLeg = (async (): Promise<ConfirmWithHorizonFallbackResult> => {
      await sleep(graceMs, race.signal);
      onHorizonStart?.();
      const verdict = (status: "confirmed" | "failed"): ConfirmWithHorizonFallbackResult => ({
        settlement: { ...pending, status, stellarTxHash: txHash },
        source: "horizon",
      });
      try {
        await pollTransactionStatus({
          txHash,
          horizonUrl: horizon.horizonUrl,
          initialIntervalMs: horizon.initialIntervalMs ?? 1500,
          maxIntervalMs: horizon.maxIntervalMs ?? 8000,
          timeoutMs: horizonBudget,
          jitter: true,
          signal: race.signal,
          notifyUser: false,
          customProbe: horizon.probe,
        });
        return verdict("confirmed");
      } catch (error) {
        if (error instanceof TransactionPollingFailedError) return verdict("failed");
        throw error;
      }
    })();
    legs.push(horizonLeg);
  }

  try {
    return await firstFulfilled(legs);
  } catch (errors) {
    if (signal?.aborted) throw new SettlementAbortedError();
    // Report the API leg's reason: it is the one the UI already explains.
    const apiError = (errors as unknown[])[0];
    throw apiError instanceof Error
      ? apiError
      : new SettlementTimeoutError("The network did not confirm the payment in time.");
  } finally {
    signal?.removeEventListener("abort", onOuterAbort);
    race.abort();
  }
}

/**
 * `Promise.any` without the ES2021 lib dependency: resolves with the first
 * fulfilled promise, or rejects with every reason (in input order) once all
 * have rejected.
 */
function firstFulfilled<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const reasons: unknown[] = new Array(promises.length);
    let rejected = 0;
    promises.forEach((promise, index) => {
      promise.then(resolve, (reason) => {
        reasons[index] = reason;
        rejected += 1;
        if (rejected === promises.length) reject(reasons);
      });
    });
  });
}
