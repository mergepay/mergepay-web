/**
 * Wallet readiness for settlement.
 *
 * A settlement is built by the API, signed in Freighter, then submitted.
 * Two failures are entirely predictable before any of that starts: there
 * is no connected account to sign with, or the wallet is pointed at a
 * different Stellar network than the one the envelope is built for. Both
 * end in a rejected signature or a rejected submission after the user has
 * already been shown a wallet prompt.
 *
 * This module is the single predicate behind both the button state and
 * the submit handler, so the control can never be enabled for a state the
 * handler would refuse — and the handler can never issue a signing
 * request the control believed was blocked.
 *
 * It complements rather than replaces server-side validation and the
 * wallet error handling in `src/lib/stellar.tsx`: a wallet can change
 * between the check and the prompt, and the API remains the authority on
 * whether a settlement is legitimate.
 */

import {
  EXPECTED_NETWORK_LABEL,
  NETWORK_PASSPHRASE,
  describeNetwork,
} from "./constants";

export type WalletReadinessCode =
  /** Everything needed to build and sign is in place. */
  | "ready"
  /** Still probing the extension — the answer is not known yet. */
  | "checking"
  /** Freighter is not installed or not reachable in this browser. */
  | "wallet_unavailable"
  /** Freighter is present but no account is shared with the app. */
  | "wallet_disconnected"
  /** The active account is not the one this session authenticated as. */
  | "account_mismatch"
  /** The wallet is configured for a different Stellar network. */
  | "network_mismatch";

/** The affordance the UI should offer to recover from a blocked state. */
export type WalletRecovery =
  | "none"
  | "install_wallet"
  | "connect_wallet"
  | "switch_account"
  | "switch_network";

export interface WalletProbe {
  /** `"checking"` until the first probe resolves. */
  status: "checking" | "resolved" | "unavailable";
  /** Active public key, or `null` when no account is shared. */
  publicKey: string | null;
  /** Passphrase the wallet is currently configured for. */
  networkPassphrase: string | null;
  /** Wallet's own name for its network (e.g. `"FUTURENET"`), if any. */
  networkName?: string | null;
}

export interface WalletReadinessInput extends WalletProbe {
  /** Public key this session authenticated as. */
  sessionPublicKey?: string | null;
  /** Passphrase the app builds envelopes for. Defaults to the configured one. */
  expectedNetworkPassphrase?: string;
  /** Label for the expected network. Defaults to the configured one. */
  expectedNetworkLabel?: string;
}

export interface WalletReadiness {
  /** `true` only when a signing request may be sent. */
  ready: boolean;
  code: WalletReadinessCode;
  /** Short heading naming the missing condition. */
  title: string;
  /** What the user has to do about it. */
  detail: string;
  recovery: WalletRecovery;
}

const READY: WalletReadiness = {
  ready: true,
  code: "ready",
  title: "Wallet ready",
  detail: "Your wallet is connected and on the right network.",
  recovery: "none",
};

/**
 * Decide whether a settlement may proceed.
 *
 * Checks run in the order the user has to fix them: a wallet that is not
 * there cannot be connected, an unconnected wallet has no account to
 * compare, and the account is checked before the network because the
 * envelope the API builds is bound to the session's account — signing
 * with a different one is unrecoverable rather than a setting to flip.
 */
export function evaluateWalletReadiness(
  input: WalletReadinessInput
): WalletReadiness {
  const expectedPassphrase =
    input.expectedNetworkPassphrase ?? NETWORK_PASSPHRASE;
  const expectedLabel = input.expectedNetworkLabel ?? EXPECTED_NETWORK_LABEL;

  if (input.status === "checking") {
    return {
      ready: false,
      code: "checking",
      title: "Checking your wallet",
      detail: "Confirming your wallet is connected and on the right network.",
      recovery: "none",
    };
  }

  if (input.status === "unavailable") {
    return {
      ready: false,
      code: "wallet_unavailable",
      title: "Freighter not found",
      detail:
        "Install the Freighter extension and refresh the page to settle from this browser.",
      recovery: "install_wallet",
    };
  }

  if (!input.publicKey) {
    return {
      ready: false,
      code: "wallet_disconnected",
      title: "Wallet not connected",
      detail:
        "Connect Freighter and share an account with Mergepay before settling.",
      recovery: "connect_wallet",
    };
  }

  if (input.sessionPublicKey && input.publicKey !== input.sessionPublicKey) {
    return {
      ready: false,
      code: "account_mismatch",
      title: "Different account selected",
      detail:
        "Freighter is on a different account than the one you signed in with. Switch back in Freighter, or sign in again with the account you want to pay from.",
      recovery: "switch_account",
    };
  }

  if (input.networkPassphrase !== expectedPassphrase) {
    const walletNetwork = describeNetwork(
      input.networkPassphrase,
      input.networkName
    );
    return {
      ready: false,
      code: "network_mismatch",
      title: "Wrong network selected",
      detail: `Mergepay settles on ${expectedLabel}, but Freighter is set to ${walletNetwork}. Switch networks in Freighter to continue.`,
      recovery: "switch_network",
    };
  }

  return READY;
}

/**
 * Whether the blocked state is one the user can clear from inside the
 * wallet, rather than one that needs a page change (install, re-auth).
 * Used to decide whether to offer a "check again" control.
 */
export function isRecoverableInWallet(readiness: WalletReadiness): boolean {
  return (
    readiness.recovery === "connect_wallet" ||
    readiness.recovery === "switch_network" ||
    readiness.recovery === "switch_account"
  );
}
