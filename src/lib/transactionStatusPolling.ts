/**
 * Transaction status polling helper for pending Stellar settlement submissions.
 *
 * Implements exponential backoff with jitter to track final ledger inclusion
 * of transactions on the Stellar network (via Horizon or Mergepay API backend)
 * and dispatches user notifications via `sonner`.
 *
 * @module lib/transactionStatusPolling
 */

import { toast } from "sonner";
import { HORIZON_URL } from "./constants";

export type TransactionPollStatus = "pending" | "success" | "failed" | "not_found";

export interface TransactionStatusResponse {
  status: TransactionPollStatus;
  txHash?: string;
  ledger?: number;
  error?: string;
  envelopeXdr?: string;
  /**
   * Minimum wait before the next probe, set when Horizon rate-limits us
   * (`429` + `Retry-After`). The poller never probes sooner than this, even
   * when its own backoff interval is shorter.
   */
  retryAfterMs?: number;
}

export interface PollTransactionStatusOptions {
  /** The Stellar transaction hash to poll. */
  txHash: string;
  /** Optional Horizon URL override (defaults to HORIZON_URL). */
  horizonUrl?: string;
  /** Initial polling interval in milliseconds. Defaults to 1000ms. */
  initialIntervalMs?: number;
  /** Maximum interval cap in milliseconds. Defaults to 8000ms. */
  maxIntervalMs?: number;
  /** Multiplier for exponential backoff. Defaults to 1.5. */
  backoffMultiplier?: number;
  /** Total timeout duration in milliseconds. Defaults to 60000ms (60s). */
  timeoutMs?: number;
  /** Whether to add random jitter to intervals to avoid sync spikes. Defaults to false (deterministic for tests). */
  jitter?: boolean;
  /** Abort signal to cancel polling when the component unmounts or user dismisses. */
  signal?: AbortSignal;
  /** Callback fired before each poll attempt. */
  onAttempt?: (attempt: number, nextIntervalMs: number) => void;
  /** Callback fired whenever the status changes. */
  onStatusChange?: (status: TransactionPollStatus) => void;
  /** Whether to show Sonner toast notifications on terminal states. Defaults to true. */
  notifyUser?: boolean;
  /** Custom probe function for test injection or custom backend routing. */
  customProbe?: (txHash: string, signal?: AbortSignal) => Promise<TransactionStatusResponse>;
}

export interface PollTransactionStatusResult {
  status: "success" | "failed";
  txHash: string;
  ledger?: number;
  attempts: number;
  durationMs: number;
  error?: string;
}

export class TransactionPollingTimeoutError extends Error {
  readonly txHash: string;
  readonly attempts: number;
  readonly durationMs: number;

  constructor(txHash: string, attempts: number, durationMs: number) {
    super(`Transaction status check timed out after ${attempts} attempts (${durationMs}ms) for ${txHash}`);
    this.name = "TransactionPollingTimeoutError";
    this.txHash = txHash;
    this.attempts = attempts;
    this.durationMs = durationMs;
  }
}

export class TransactionPollingAbortedError extends Error {
  readonly txHash: string;

  constructor(txHash: string) {
    super(`Transaction status check aborted for ${txHash}`);
    this.name = "TransactionPollingAbortedError";
    this.txHash = txHash;
  }
}

export class TransactionPollingFailedError extends Error {
  readonly txHash: string;
  readonly attempts: number;

  constructor(txHash: string, attempts: number, message?: string) {
    super(message ?? `Transaction settlement failed on Stellar for ${txHash}`);
    this.name = "TransactionPollingFailedError";
    this.txHash = txHash;
    this.attempts = attempts;
  }
}

/**
 * Calculates exponential backoff interval for a given attempt index.
 *
 * formula: min(maxInterval, initialInterval * (backoffMultiplier ^ (attempt - 1)))
 */
export function calculateBackoff(
  attempt: number,
  initialIntervalMs = 1000,
  maxIntervalMs = 8000,
  backoffMultiplier = 1.5,
  jitter = false
): number {
  if (attempt <= 1) return initialIntervalMs;
  const factor = Math.pow(backoffMultiplier, attempt - 1);
  const calculated = Math.min(maxIntervalMs, Math.round(initialIntervalMs * factor));
  if (!jitter) return calculated;
  // Apply +/- 15% random jitter
  const jitterRange = calculated * 0.15;
  const randomDelta = (Math.random() * 2 - 1) * jitterRange;
  return Math.max(initialIntervalMs, Math.min(maxIntervalMs, Math.round(calculated + randomDelta)));
}

/** Fallback wait when Horizon sends a 429 without a usable `Retry-After`. */
export const DEFAULT_RATE_LIMIT_BACKOFF_MS = 2000;
/** Upper bound on a `Retry-After` we honour, so one header can't stall a poll. */
export const MAX_RATE_LIMIT_BACKOFF_MS = 30_000;

/**
 * Converts a `Retry-After` header (delta-seconds or an HTTP date) into a wait
 * in milliseconds, clamped to `[0, MAX_RATE_LIMIT_BACKOFF_MS]`. Missing or
 * unparseable values fall back to `DEFAULT_RATE_LIMIT_BACKOFF_MS`.
 */
export function parseRetryAfterMs(header: string | null, now = Date.now()): number {
  if (!header) return DEFAULT_RATE_LIMIT_BACKOFF_MS;
  const trimmed = header.trim();
  let ms: number;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    ms = Number(trimmed) * 1000;
  } else {
    const at = Date.parse(trimmed);
    if (Number.isNaN(at)) return DEFAULT_RATE_LIMIT_BACKOFF_MS;
    ms = at - now;
  }
  return Math.min(MAX_RATE_LIMIT_BACKOFF_MS, Math.max(0, Math.round(ms)));
}

/**
 * Default Horizon transaction status probe querying the /transactions/{hash} endpoint.
 */
export async function defaultHorizonProbe(
  txHash: string,
  horizonUrl = HORIZON_URL,
  signal?: AbortSignal
): Promise<TransactionStatusResponse> {
  const url = `${horizonUrl.replace(/\/+$/, "")}/transactions/${encodeURIComponent(txHash)}`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });

  if (response.status === 200) {
    const data = await response.json();
    const successful = data.successful ?? true;
    return {
      status: successful ? "success" : "failed",
      txHash,
      ledger: typeof data.ledger === "number" ? data.ledger : undefined,
      envelopeXdr: data.envelope_xdr,
      error: successful ? undefined : "Transaction marked unsuccessful on Stellar ledger.",
    };
  }

  if (response.status === 404) {
    // Transaction has not been included in a ledger yet (pending)
    return { status: "pending", txHash };
  }

  if (response.status === 429) {
    // Rate limited: still pending as far as we know, but back off for as long
    // as Horizon asks before the next probe.
    const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
    const errorMsg = `Horizon rate limited (429). Retry after ${Math.ceil(retryAfterMs / 1000)}s.`;
    return { status: "pending", txHash, error: errorMsg, retryAfterMs };
  }

  // Non-200 / non-404 / non-429 unexpected status
  return {
    status: "pending",
    txHash,
    error: `Unexpected Horizon response status ${response.status}`,
  };
}

/**
 * Wait for a short duration with AbortSignal cancellation support.
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new TransactionPollingAbortedError(""));
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new TransactionPollingAbortedError(""));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Polls Stellar transaction status with exponential backoff until confirmed on-chain,
 * failed, or timed out. Dispatches user notifications via Sonner.
 */
export async function pollTransactionStatus(
  options: PollTransactionStatusOptions
): Promise<PollTransactionStatusResult> {
  const {
    txHash,
    horizonUrl = HORIZON_URL,
    initialIntervalMs = 1000,
    maxIntervalMs = 8000,
    backoffMultiplier = 1.5,
    timeoutMs = 60000,
    jitter = false,
    signal,
    onAttempt,
    onStatusChange,
    notifyUser = true,
    customProbe,
  } = options;

  const startTime = Date.now();
  const deadline = startTime + timeoutMs;
  let attempt = 0;
  let lastStatus: TransactionPollStatus | null = null;

  const probe = customProbe ?? ((hash, s) => defaultHorizonProbe(hash, horizonUrl, s));

  for (;;) {
    let retryAfterMs = 0;
    if (signal?.aborted) {
      throw new TransactionPollingAbortedError(txHash);
    }

    const elapsed = Date.now() - startTime;
    if (Date.now() >= deadline) {
      if (notifyUser) {
        toast.warning(
          "Transaction confirmation timed out. It may still be processing on Stellar; check status again shortly."
        );
      }
      throw new TransactionPollingTimeoutError(txHash, attempt, elapsed);
    }

    attempt += 1;
    const currentInterval = calculateBackoff(
      attempt,
      initialIntervalMs,
      maxIntervalMs,
      backoffMultiplier,
      jitter
    );

    onAttempt?.(attempt, currentInterval);

    try {
      const result = await probe(txHash, signal);

      retryAfterMs = result.retryAfterMs ?? 0;

      if (result.status !== lastStatus) {
        lastStatus = result.status;
        onStatusChange?.(result.status);
      }

      if (result.status === "success") {
        if (notifyUser) {
          toast.success("Transaction confirmed on Stellar ledger.");
        }
        return {
          status: "success",
          txHash,
          ledger: result.ledger,
          attempts: attempt,
          durationMs: Date.now() - startTime,
        };
      }

      if (result.status === "failed") {
        if (notifyUser) {
          toast.error(
            result.error ?? "Transaction settlement failed on Stellar. Balances were not affected."
          );
        }
        throw new TransactionPollingFailedError(txHash, attempt, result.error);
      }
      // "pending" or "not_found": keep polling
    } catch (err) {
      if (err instanceof TransactionPollingAbortedError || err instanceof TransactionPollingFailedError) {
        throw err;
      }
      // Network hiccup or fetch disconnect: treat as transient read failure and continue polling until deadline
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      if (notifyUser) {
        toast.warning(
          "Transaction confirmation timed out. It may still be processing on Stellar; check status again shortly."
        );
      }
      throw new TransactionPollingTimeoutError(txHash, attempt, Date.now() - startTime);
    }

    // A rate-limited probe waits at least as long as Horizon asked.
    const sleepMs = Math.min(Math.max(currentInterval, retryAfterMs), remaining);
    try {
      await delay(sleepMs, signal);
    } catch {
      throw new TransactionPollingAbortedError(txHash);
    }
  }
}
