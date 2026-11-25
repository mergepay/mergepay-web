/**
 * The lifecycle of a wallet-signed on-chain submission (#545).
 *
 * Adding a trustline is not one async call — it builds an envelope, waits for
 * a Freighter signature, submits to Horizon, and then waits for the network to
 * show the result. Each leg can hang, fail, or succeed, and the user needs to
 * know which one they are on. This module holds that model in one place:
 *
 *  - the phase names and the labels the UI shows for them,
 *  - the stepper layout the progress bar renders,
 *  - how a thrown error maps to copy plus a *recovery action*,
 *  - the polling loop that turns "submitted" into "confirmed".
 *
 * It is deliberately free of React, DOM, and wallet imports so the whole state
 * machine can be unit-tested with a fake probe, the same way `settlementRetry.ts`
 * and `trustlineCheck.ts` keep their decisions pure.
 */

import type { WalletErrorCode } from "./stellar";
import { recoveryActionFor, type RecoveryAction } from "./settlementRetry";

/** Every leg of a submission, including the two terminal ones. */
export type WalletSubmissionPhase =
  | "preparing"
  | "signing"
  | "submitting"
  | "confirming"
  | "confirmed"
  | "failed";

/**
 * The legs `addTrustline` reports on: it owns build → sign → submit and hands
 * back before the confirmation poll starts.
 */
export type WalletBuildPhase = Extract<
  WalletSubmissionPhase,
  "preparing" | "signing" | "submitting"
>;

/** One visible step of the progress bar. */
export interface SubmissionStep {
  id: WalletBuildPhase | "confirm";
  label: string;
}

/**
 * The four legs a user can see. The terminal phases are not steps:
 * "confirmed" completes the last step, and "failed" is drawn as an error on
 * whichever step was active.
 */
export const SUBMISSION_STEPS: readonly SubmissionStep[] = [
  { id: "preparing", label: "Prepare" },
  { id: "signing", label: "Sign" },
  { id: "submitting", label: "Submit" },
  { id: "confirm", label: "Confirm" },
];

/**
 * Full-sentence status label for a phase — what the live region reads out.
 * Phrased as "what is happening right now" rather than as a step name, because
 * a user who has been waiting needs to know whether to act or to keep waiting.
 */
const PHASE_LABELS: Record<WalletSubmissionPhase, string> = {
  preparing: "Building the transaction for your wallet…",
  signing: "Waiting for your signature in Freighter…",
  submitting: "Submitting the signed transaction to Stellar…",
  confirming: "Waiting for the network to confirm…",
  confirmed: "Confirmed on Stellar.",
  failed: "This attempt did not complete.",
};

export function phaseLabelFor(phase: WalletSubmissionPhase): string {
  return PHASE_LABELS[phase];
}

/**
 * Stepper position for a phase: the number of *completed* steps, so `0` means
 * "nothing done yet" and `SUBMISSION_STEPS.length` means "all four done".
 * `failed` has no position of its own — callers keep the last phase they were
 * given so the bar still shows which leg broke.
 */
export function completedStepsFor(phase: WalletSubmissionPhase): number {
  switch (phase) {
    case "preparing":
      return 0;
    case "signing":
      return 1;
    case "submitting":
      return 2;
    case "confirming":
      return 3;
    case "confirmed":
      return SUBMISSION_STEPS.length;
    case "failed":
      return 0;
  }
}

/** Whether a submission still has work in flight (blocks duplicate submits). */
export function isInFlightPhase(
  phase: WalletSubmissionPhase | null
): boolean {
  return (
    phase === "preparing" ||
    phase === "signing" ||
    phase === "submitting" ||
    phase === "confirming"
  );
}

/**
 * A submission that reached the network but was not seen on-chain inside the
 * polling window. This is *not* a failure: the transaction is probably still
 * applying, so the only safe next step is to look again — never to sign a
 * second one. Carries the hash so the UI can link to the explorer.
 */
export class SubmissionUnconfirmedError extends Error {
  readonly code = "unconfirmed";
  readonly txHash: string | null;

  constructor(txHash: string | null) {
    super("The network has not confirmed the transaction yet.");
    this.name = "SubmissionUnconfirmedError";
    this.txHash = txHash;
  }
}

/** Thrown when the caller's `AbortSignal` fires mid-poll. */
export class SubmissionAbortedError extends Error {
  readonly code = "aborted";

  constructor() {
    super("The status check was cancelled.");
    this.name = "SubmissionAbortedError";
  }
}

/**
 * What the UI can offer after a failure. Extends the settlement recovery set
 * with `"check"` — re-poll a transaction we already submitted. Retrying the
 * whole flow after a timeout would ask the user to sign a second changeTrust.
 */
export type SubmissionRecovery = RecoveryAction | "check";

/**
 * The stable code behind a failure. Wallet codes pass through unchanged so a
 * caller can translate them with `walletMessage`; `"unconfirmed"` is ours and
 * means "submitted, still landing" rather than "broken". `null` is a failure
 * from somewhere we have no vocabulary for (a plain `Error` from fetch).
 */
export type SubmissionErrorCode = WalletErrorCode | "unconfirmed" | null;

export interface SubmissionFailure {
  title: string;
  message: string;
  recovery: SubmissionRecovery;
  /** Stable code, or `null` when the error did not come from the wallet. */
  code: SubmissionErrorCode;
  /**
   * The hash of the transaction this attempt submitted, when there is one.
   * It is the user's proof of what their wallet signed, and the only way to
   * check on a slow confirmation by hand — so it survives into the error state.
   */
  txHash: string | null;
}

/** The wallet codes `recoveryActionFor` routes somewhere specific. */
const WALLET_CODES = new Set<WalletErrorCode>([
  "not_installed",
  "locked",
  "disconnected",
  "user_rejected",
  "network",
  "network_mismatch",
  "unknown",
]);

function isWalletCode(code: unknown): code is WalletErrorCode {
  return typeof code === "string" && WALLET_CODES.has(code as WalletErrorCode);
}

/**
 * Describe a thrown error for a trustline submission.
 *
 * Wallet failures are recognised by their stable `code` (`WalletError`), so
 * this module never imports the wallet layer, and the recovery comes from
 * `recoveryActionFor` — the same decision the settle flow makes, which keeps
 * "locked wallet" meaning "Reconnect wallet" everywhere in the app.
 *
 * Wallet codes get fixed, reviewed copy and are also returned as `code` so a
 * caller can translate them with `walletMessage`. The raw string a provider
 * threw is never shown for those: it is an extension internals message, and a
 * user cannot act on "status: ERROR". Only an error we have no vocabulary for
 * falls back to its own message, and those come from this app's own fetch
 * helpers, which write user-facing sentences.
 */
export function describeSubmissionFailure(
  error: unknown,
  txHash: string | null = null
): SubmissionFailure {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : "";

  if (error instanceof SubmissionUnconfirmedError) {
    return {
      title: "Still confirming",
      message:
        "Your transaction was submitted but we have not seen it land yet. It is probably still processing — check again rather than signing a second one.",
      recovery: "check",
      code: "unconfirmed",
      txHash: error.txHash ?? txHash,
    };
  }

  if (code === "user_rejected") {
    return {
      title: "Signature declined",
      message:
        "You cancelled the request in Freighter. Nothing was submitted, so you can try again when you are ready.",
      recovery: "retry",
      code: "user_rejected",
      txHash,
    };
  }

  const recovery = recoveryActionFor(isWalletCode(code) ? code : null);

  if (recovery === "install") {
    return {
      title: "Wallet not found",
      message:
        "Freighter did not respond, so nothing was submitted. Install or enable it and try again.",
      recovery,
      code: "not_installed",
      txHash,
    };
  }

  if (recovery === "reconnect") {
    return {
      title: "Wallet needs attention",
      message:
        "Freighter is locked or on another account. Unlock it and reconnect before trying again.",
      recovery,
      code: isWalletCode(code) ? code : "disconnected",
      txHash,
    };
  }

  if (code === "network_mismatch") {
    return {
      title: "Wrong network",
      message:
        "Freighter is on a different network than this group uses. Switch it over and try again.",
      recovery: "retry",
      code,
      txHash,
    };
  }

  // A trustline costs 0.5 XLM of available reserve, and Horizon reports the
  // shortfall as `op_low_reserve` on an otherwise opaque failed transaction.
  // "The network refused this transaction" would leave the user guessing, so
  // name the missing funds instead, with the copy `stellar/trustlines.ts`
  // already uses. `code` stays null: this is the network talking, not
  // Freighter, and the callers translate wallet codes over our message.
  if (
    /op_low_reserve|insufficient (xlm )?reserve|insufficient balance|tx_insufficient_balance|low reserve/i.test(
      message
    )
  ) {
    return {
      title: "Insufficient XLM reserve",
      message:
        "Insufficient XLM reserve. Adding a trustline requires an additional 0.5 XLM available in your wallet.",
      recovery: "retry",
      code: null,
      txHash,
    };
  }

  if (recovery === "retry" && txHash) {
    // Something was submitted but the network refused it: show the hash so the
    // user can read the exact failure rather than our guess at it.
    return {
      title: "Stellar rejected it",
      message:
        "The network refused this transaction. Open it in the explorer for the exact error.",
      recovery,
      code: isWalletCode(code) ? code : null,
      txHash,
    };
  }

  if (code === "network" || (error instanceof TypeError && /fetch|network/i.test(message))) {
    return {
      title: "Network error",
      message:
        "We could not reach the Stellar network. Check your connection and try again.",
      recovery: "retry",
      code: code === "network" ? "network" : null,
      txHash,
    };
  }

  return {
    title: "Trustline not added",
    message: message || "Something went wrong while setting up this trustline.",
    recovery: "retry",
    code: isWalletCode(code) ? code : null,
    txHash,
  };
}

// ---------------------------------------------------------------------------
// Confirmation polling
// ---------------------------------------------------------------------------

export interface PollOptions {
  /** One look. Returns true once the change is visible on-chain. */
  probe: () => Promise<boolean>;
  /** Known transaction hash, attached to the timeout error for the explorer link. */
  txHash?: string | null;
  /** How long to keep looking before giving up. */
  timeoutMs?: number;
  /** Gap between looks. */
  intervalMs?: number;
  /** Fired when the dialog closes or the component unmounts. */
  signal?: AbortSignal;
  /** Called before every probe, so the UI can say how long it has waited. */
  onAttempt?: (attempt: number) => void;
}

export const DEFAULT_POLL_TIMEOUT_MS = 45_000;
export const DEFAULT_POLL_INTERVAL_MS = 2_000;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new SubmissionAbortedError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new SubmissionAbortedError());
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Poll `probe` until it reports the change, the deadline passes, or `signal`
 * aborts.
 *
 * Resolves on the first true. Rejects with `SubmissionUnconfirmedError` at the
 * deadline — which, per the note on that class, means "keep looking", not "it
 * failed". A probe that throws is treated as a transient read and the loop
 * continues until the deadline: a Horizon hiccup must not turn a successful
 * submission into a scary error.
 */
export async function pollUntilConfirmed({
  probe,
  txHash = null,
  timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  signal,
  onAttempt,
}: PollOptions): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  for (;;) {
    if (signal?.aborted) throw new SubmissionAbortedError();
    attempt += 1;
    onAttempt?.(attempt);
    try {
      if (await probe()) return;
    } catch (e) {
      if (e instanceof SubmissionAbortedError) throw e;
      // Transient probe failure — keep polling until the deadline.
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new SubmissionUnconfirmedError(txHash);
    await wait(Math.min(intervalMs, remaining), signal);
  }
}
