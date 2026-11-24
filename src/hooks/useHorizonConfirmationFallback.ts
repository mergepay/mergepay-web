"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  pollTransactionStatus,
  TransactionPollingAbortedError,
  TransactionPollingFailedError,
  TransactionPollingTimeoutError,
  type TransactionStatusResponse,
} from "@/lib/transactionStatusPolling";

/**
 * Where the direct-to-Horizon confirmation check stands.
 *
 * - `idle`: not started (disabled, no hash yet, or still inside the grace period)
 * - `polling`: asking Horizon for the transaction with exponential backoff
 * - `confirmed` / `failed`: Horizon reported the transaction in a closed ledger
 * - `timed_out`: Horizon never saw it within `timeoutMs`; it may still land
 */
export type HorizonFallbackStatus = "idle" | "polling" | "confirmed" | "failed" | "timed_out";

export interface HorizonFallbackState {
  status: HorizonFallbackStatus;
  /** Ledger sequence the transaction closed in, once `confirmed`. */
  ledger?: number;
  /** Horizon's reason, once `failed`. */
  error?: string;
  /** Probes sent in the current window. */
  attempts: number;
}

export interface UseHorizonConfirmationFallbackOptions {
  /** Hash of the signed envelope. Nothing is polled without one. */
  txHash: string | null;
  /** Polls only while true; turning it off aborts an in-flight poll. */
  enabled: boolean;
  /**
   * How long to give the Mergepay API to report the outcome before asking
   * Horizon directly. Default 4s: roughly one ledger close, so a healthy API
   * usually answers first and Horizon is never touched.
   */
  graceMs?: number;
  /** Give up after this long. Default 90s (~18 ledgers). */
  timeoutMs?: number;
  /** First backoff interval. Default 1.5s. */
  initialIntervalMs?: number;
  /** Backoff ceiling. Default 8s. */
  maxIntervalMs?: number;
  /** Horizon instance to query. Default: the configured network's. */
  horizonUrl?: string;
  /** Test seam: replaces the Horizon `fetch`. */
  probe?: (txHash: string, signal?: AbortSignal) => Promise<TransactionStatusResponse>;
}

export interface UseHorizonConfirmationFallbackResult {
  state: HorizonFallbackState;
  /** Start a fresh polling window now, skipping the grace period. */
  restart: () => void;
}

const IDLE: HorizonFallbackState = { status: "idle", attempts: 0 };

/**
 * Resilient fallback for settlement confirmation (#814).
 *
 * The settle dialog normally learns a payment's outcome from the Mergepay API,
 * which submits the signed envelope to Horizon and records the result. When
 * the API is slow, its status polling stalls, or the submit request itself is
 * lost after signing, the dialog would otherwise sit on a spinner with no way
 * to learn what happened on-chain. This hook asks Horizon directly
 * (`GET /transactions/{hash}`) with exponential backoff, honouring
 * `Retry-After` on rate limits, until the transaction shows up in a closed
 * ledger, fails, or `timeoutMs` passes.
 *
 * It only reads: nothing is ever re-submitted, so it is safe to run alongside
 * the API's own status polling. Whichever reports first wins.
 */
export function useHorizonConfirmationFallback({
  txHash,
  enabled,
  graceMs = 4000,
  timeoutMs = 90_000,
  initialIntervalMs = 1500,
  maxIntervalMs = 8000,
  horizonUrl,
  probe,
}: UseHorizonConfirmationFallbackOptions): UseHorizonConfirmationFallbackResult {
  const [state, setState] = useState<HorizonFallbackState>(IDLE);
  // Bumped by `restart`; each value is one polling window.
  const [pollWindow, setPollWindow] = useState(0);
  const skipGraceRef = useRef(false);
  const probeRef = useRef(probe);
  probeRef.current = probe;

  // A new transaction starts from scratch.
  useEffect(() => {
    setState(IDLE);
    skipGraceRef.current = false;
  }, [txHash]);

  useEffect(() => {
    if (!enabled || !txHash) return;

    const controller = new AbortController();
    const wait = skipGraceRef.current ? 0 : graceMs;
    skipGraceRef.current = false;

    const timer = setTimeout(() => {
      setState({ status: "polling", attempts: 0 });
      const customProbe = probeRef.current;
      pollTransactionStatus({
        txHash,
        horizonUrl,
        initialIntervalMs,
        maxIntervalMs,
        timeoutMs,
        jitter: true,
        signal: controller.signal,
        // The dialog owns the user-facing messaging for every outcome.
        notifyUser: false,
        onAttempt: (attempts) =>
          setState((prev) => (prev.status === "polling" ? { ...prev, attempts } : prev)),
        customProbe: customProbe ? (hash, signal) => customProbe(hash, signal) : undefined,
      })
        .then((result) => {
          if (controller.signal.aborted) return;
          setState({ status: "confirmed", ledger: result.ledger, attempts: result.attempts });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || error instanceof TransactionPollingAbortedError) return;
          if (error instanceof TransactionPollingFailedError) {
            setState({ status: "failed", error: error.message, attempts: error.attempts });
          } else if (error instanceof TransactionPollingTimeoutError) {
            setState({ status: "timed_out", attempts: error.attempts });
          } else {
            setState((prev) => ({ status: "timed_out", attempts: prev.attempts }));
          }
        });
    }, wait);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, txHash, pollWindow, graceMs, timeoutMs, initialIntervalMs, maxIntervalMs, horizonUrl]);

  const restart = useCallback(() => {
    skipGraceRef.current = true;
    setState(IDLE);
    setPollWindow((n) => n + 1);
  }, []);

  return { state, restart };
}
