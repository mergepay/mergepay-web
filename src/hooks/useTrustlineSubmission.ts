"use client";

/**
 * One trustline submission, from click to on-chain confirmation (#545).
 *
 * `addTrustline` resolves as soon as Horizon *accepts* the transaction — the
 * trustline is not usable yet, and both trustline surfaces used to mark it
 * ready at that moment. This hook owns the part that was missing: it reports
 * which leg the user is waiting on, then polls until the network actually
 * shows the trustline, and only then calls `onConfirmed`.
 *
 * React Query carries the submission's outcome (`isPending` / `isError` /
 * `isSuccess`) and keeps the run tied to the component's cache. The thing that
 * actually stops a duplicate signature request is `createSubmissionGate` from
 * `submission.ts`: it flips synchronously, before any `await`, so a double
 * click or an Enter auto-repeat is refused rather than building a second
 * `changeTrust` and opening a second Freighter popup. The phase is separate
 * local state because React Query has no notion of the sub-legs — it can say
 * "this mutation hasn't finished", not "you are waiting on your wallet".
 *
 * The safety property that shaped this file: a submission we cannot confirm is
 * never treated as a failure to retry. Retrying after a timeout would build
 * and sign a *second* trustline transaction. So `mode: "check"` exists, and it
 * is the only thing offered once a hash exists.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { addTrustline, hasTrustline } from "@/lib/stellar";
import { createSubmissionGate } from "@/lib/submission";
import {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POLL_TIMEOUT_MS,
  SubmissionAbortedError,
  describeSubmissionFailure,
  completedStepsFor,
  isInFlightPhase,
  phaseLabelFor,
  pollUntilConfirmed,
  type SubmissionFailure,
  type WalletSubmissionPhase,
} from "@/lib/walletSubmission";

export interface TrustlineTarget {
  code: string;
  issuer: string;
}

export type TrustlineSubmissionMode = "submit" | "check";

/** What one run of the mutation needs: which asset, and which intent. */
interface SubmissionVariables extends TrustlineTarget {
  mode: TrustlineSubmissionMode;
  publicKey: string;
}

/** What the caller needs to refresh its own view after a confirmation. */
export type ConfirmedTrustline = TrustlineTarget & { txHash: string };

export interface UseTrustlineSubmissionOptions {
  /** Wallet the `changeTrust` is built for. Nothing can run while it is null. */
  publicKey: string | null;
  /** Fired once the trustline is visible on-chain. */
  onConfirmed?: (trustline: ConfirmedTrustline) => void;
  /** Poll cadence; tightened in tests, left alone in the app. */
  poll?: { timeoutMs?: number; intervalMs?: number };
}

export interface TrustlineSubmissionState {
  /** Asset of the current or most recent attempt, with its intent. */
  target: (TrustlineTarget & { mode: TrustlineSubmissionMode }) | null;
  /** Current leg, or `null` before the first click. */
  phase: WalletSubmissionPhase | null;
  /** Full-sentence label for `phase`, for the live region. */
  label: string | null;
  /** Completed-step count for the progress bar. */
  completed: number;
  /** Hash of the transaction we submitted, as soon as one exists. */
  txHash: string | null;
  /** Set when the attempt failed or is still unconfirmed. */
  failure: SubmissionFailure | null;
  /** True while a leg is in flight — disables the CTA. */
  busy: boolean;
  /** Probes made so far in the current confirmation poll. */
  pollAttempts: number;
  /** Build, sign, submit, then confirm. Ignored while busy or without a wallet. */
  submit: (target: TrustlineTarget) => void;
  /** Re-poll a transaction that was already submitted. Never signs anything. */
  checkAgain: () => void;
  /** Forget the attempt so the surface can start clean. */
  reset: () => void;
}

export function useTrustlineSubmission({
  publicKey,
  onConfirmed,
  poll,
}: UseTrustlineSubmissionOptions): TrustlineSubmissionState {
  const [phase, setPhase] = useState<WalletSubmissionPhase | null>(null);
  const [target, setTarget] = useState<TrustlineSubmissionState["target"]>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [failure, setFailure] = useState<SubmissionFailure | null>(null);
  const [pollAttempts, setPollAttempts] = useState(0);

  // Cancel the poll when the surface closes, so a dialog unmounting mid-wait
  // doesn't keep hammering Horizon and land its result on nothing.
  const abortRef = useRef<AbortController | null>(null);
  // React state updates are async, so `busy` derived from the phase cannot
  // reject two activations that land in the same tick (a double-click, an
  // Enter auto-repeat). This gate flips synchronously before any await, which
  // is the point of it: a second activation is refused, so Freighter is asked
  // to sign exactly one transaction per click.
  const gateRef = useRef(createSubmissionGate());
  // `onConfirmed` is a callback prop; keeping it in a ref means `submit`
  // doesn't change identity every render (the components pass inline arrow
  // functions) and a stale closure can't call an outdated handler.
  const onConfirmedRef = useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;

  useEffect(
    () => () => {
      abortRef.current?.abort();
      gateRef.current.end();
    },
    []
  );

  const timeoutMs = poll?.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const intervalMs = poll?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const mutation = useMutation({
    mutationFn: async (variables: SubmissionVariables) => {
      const { code, issuer, mode, publicKey: wallet } = variables;
      const controller = new AbortController();
      abortRef.current = controller;

      setPollAttempts(0);
      setFailure(null);

      let hash: string | null = txHash;
      if (mode === "submit") {
        // A fresh attempt starts from no hash at all: if this run fails before
        // the network accepts anything, an old hash would be a lie.
        hash = null;
        setTxHash(null);
        const result = await addTrustline(wallet, code, issuer, (leg) =>
          setPhase(leg)
        );
        hash = result.txHash;
        setTxHash(hash);
      }

      // Accepted by Horizon is not the same as visible on-chain: poll the
      // account until the balance entry shows up.
      setPhase("confirming");
      await pollUntilConfirmed({
        probe: () => hasTrustline(wallet, code, issuer),
        txHash: hash,
        timeoutMs,
        intervalMs,
        signal: controller.signal,
        onAttempt: setPollAttempts,
      });

      return { code, issuer, txHash: hash ?? "" };
    },
    onSuccess: (trustline) => {
      // Release the latch in the same tick as the terminal state, not in
      // `onSettled`: React Query awaits `onSuccess`/`onError` *before* it
      // dispatches its own status change, so a render can land between the two
      // callbacks. A run that releases the latch one microtask after it paints
      // "failed" paints a recovery button that is disabled for a beat — which
      // is exactly the moment the user reaches for it.
      gateRef.current.end();
      setPhase("confirmed");
      onConfirmedRef.current?.(trustline);
    },
    onError: (error, variables) => {
      // An aborted poll is our own cancellation, not news for the user —
      // returning before any state changes keeps a stale error off screen.
      // The gate is deliberately left alone too: `reset()` releases it
      // synchronously and an unmount has no surface to re-enable, so releasing
      // it here would let a cancelled run unlock a fresh attempt that started
      // in between.
      if (error instanceof SubmissionAbortedError) return;
      gateRef.current.end();
      setPhase("failed");
      // Only a re-check run has a hash we can stand behind. In a submit run the
      // hash, if any, is carried by the error itself, so the previous
      // attempt's hash can never leak into this failure.
      setFailure(
        describeSubmissionFailure(
          error,
          variables?.mode === "check" ? txHash : null
        )
      );
    },
  });

  function run(next: TrustlineTarget & { mode: TrustlineSubmissionMode }) {
    if (!publicKey || !gateRef.current.begin()) return;
    setTarget(next);
    setPhase(next.mode === "submit" ? "preparing" : "confirming");
    mutation.mutate({ ...next, publicKey });
  }

  return {
    target,
    phase,
    label: phase ? phaseLabelFor(phase) : null,
    completed: phase ? completedStepsFor(phase) : 0,
    txHash,
    failure,
    // Derived from the gate and the phase, not from `mutation.isPending`:
    // React Query publishes its own status a tick after our `onError`/`onSuccess`
    // run, and a button that stays disabled through that gap looks like a hung
    // app to the user right when they want to retry.
    busy: gateRef.current.active || isInFlightPhase(phase),
    pollAttempts,
    submit: (t) => run({ ...t, mode: "submit" }),
    checkAgain: () => {
      if (target) run({ ...target, mode: "check" });
    },
    reset: () => {
      abortRef.current?.abort();
      // The aborted run releases the latch in `onError`, but that lands a
      // microtask later; ending it here means a surface that resets and then
      // starts a fresh attempt is not silently refused.
      gateRef.current.end();
      setPhase(null);
      setTarget(null);
      setTxHash(null);
      setFailure(null);
      setPollAttempts(0);
    },
  };
}
