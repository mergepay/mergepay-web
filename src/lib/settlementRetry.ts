/**
 * How the settle flow should recover from a failed attempt.
 *
 * Kept separate from the dialog (and free of runtime wallet imports) so the
 * decision is unit-testable and identical everywhere it is used.
 */

import type { WalletErrorCode } from "./stellar";

export type RecoveryAction =
  /** Re-run the flow from scratch — a new intent and a new sign request. */
  | "retry"
  /** The wallet link is broken; re-establish it before another attempt. */
  | "reconnect"
  /** Freighter isn't there at all; nothing to retry against. */
  | "install";

/**
 * Pick the recovery action for a failed settlement attempt.
 *
 * `null` covers non-wallet failures (API errors, a rejected transaction, a
 * failed validation) — those are transient or server-side, so retrying is the
 * right offer.
 */
export function recoveryActionFor(
  code: WalletErrorCode | null | undefined
): RecoveryAction {
  switch (code) {
    case "not_installed":
      return "install";
    case "disconnected":
    case "locked":
      // Both need the user to act inside Freighter and hand access back
      // before a signature can be requested again.
      return "reconnect";
    default:
      return "retry";
  }
}

/**
 * Label for the primary button after a failure. A user-cancelled signature is
 * the common case and reads better as "Try again" than as a recovery step.
 */
export function retryLabelFor(
  code: WalletErrorCode | null | undefined
): string {
  return recoveryActionFor(code) === "reconnect"
    ? "Reconnect wallet"
    : "Try again";
}
