/**
 * Wallet + network status mapping.
 *
 * Turns what we can observe about Freighter — is it installed, has it granted
 * an address, which network is it pointed at — into a single state with
 * user-facing copy and a recovery action.
 *
 * Nothing here touches secret material. The only wallet data that reaches the
 * app is the public address and the selected network; neither is persisted.
 * This module is free of React and browser APIs so the rules can be tested
 * directly.
 */

/** Badge tones available in `src/components/ui/badge.tsx`. */
export type WalletStatusTone = "lime" | "butter" | "flamingo" | "paper";

export type WalletStatusKind =
  | "checking"
  | "unavailable"
  | "disconnected"
  | "network_mismatch"
  | "connected";

/** The recovery step offered to the user for a given state. */
export type WalletActionKind = "install" | "connect" | "switch_network" | null;

/** Raw observations about the wallet — all optional, all public data. */
export interface WalletProbe {
  /** `null` while the first availability check is still running. */
  available: boolean | null;
  /** Public address the wallet has granted, or `null` if access was not given. */
  address: string | null;
  /** Network passphrase the wallet is currently pointed at, if readable. */
  networkPassphrase: string | null;
  /** Human-readable network name reported by the wallet (e.g. "TESTNET"). */
  networkName: string | null;
}

/** The network this deployment is configured for. */
export interface ExpectedNetwork {
  networkPassphrase: string;
  /** Value of NEXT_PUBLIC_STELLAR_NETWORK — "public" or "testnet". */
  network: string;
}

export interface WalletStatus {
  kind: WalletStatusKind;
  /** Short badge text. */
  label: string;
  /** One-sentence explanation of the state. */
  message: string;
  /** Label for the recovery control, or `null` when no action is needed. */
  actionLabel: string | null;
  actionKind: WalletActionKind;
  tone: WalletStatusTone;
  /** True only when a transaction can actually be signed right now. */
  canSign: boolean;
  /** Public address, echoed back for convenience. Never a secret. */
  address: string | null;
  /** Network the wallet is on, when known. */
  networkName: string | null;
}

/** Friendly name for the network this deployment targets. */
export function networkDisplayName(network: string): string {
  return network === "public" ? "Stellar mainnet" : "Stellar testnet";
}

/**
 * Map a probe onto the single status the UI renders.
 *
 * A wallet that has granted an address but whose network we could not read is
 * reported as connected: Freighter itself rejects a signature request carrying
 * the wrong network passphrase, so we do not block the user on a reading we
 * failed to take.
 */
export function deriveWalletStatus(
  probe: WalletProbe,
  expected: ExpectedNetwork
): WalletStatus {
  const expectedName = networkDisplayName(expected.network);

  if (probe.available === null) {
    return {
      kind: "checking",
      label: "Checking wallet",
      message: "Looking for your Freighter wallet.",
      actionLabel: null,
      actionKind: null,
      tone: "paper",
      canSign: false,
      address: null,
      networkName: null,
    };
  }

  if (!probe.available) {
    return {
      kind: "unavailable",
      label: "No wallet",
      message:
        "Freighter was not detected in this browser. Install the extension to settle on Stellar.",
      actionLabel: "Install Freighter",
      actionKind: "install",
      tone: "flamingo",
      canSign: false,
      address: null,
      networkName: null,
    };
  }

  if (!probe.address) {
    return {
      kind: "disconnected",
      label: "Not connected",
      message:
        "Freighter is installed but has not shared an account with Mergepay yet.",
      actionLabel: "Connect wallet",
      actionKind: "connect",
      tone: "butter",
      canSign: false,
      address: null,
      networkName: probe.networkName,
    };
  }

  if (
    probe.networkPassphrase !== null &&
    probe.networkPassphrase !== expected.networkPassphrase
  ) {
    const on = probe.networkName ? ` (currently ${probe.networkName})` : "";
    return {
      kind: "network_mismatch",
      label: "Wrong network",
      message: `Your wallet is on a different network${on}. Switch it to ${expectedName} before signing.`,
      actionLabel: "How to switch",
      actionKind: "switch_network",
      tone: "flamingo",
      canSign: false,
      address: probe.address,
      networkName: probe.networkName,
    };
  }

  return {
    kind: "connected",
    label: "Connected",
    message: `Connected to ${expectedName}. Mergepay never sees your keys.`,
    actionLabel: null,
    actionKind: null,
    tone: "lime",
    canSign: true,
    address: probe.address,
    networkName: probe.networkName,
  };
}

/**
 * Why an on-chain action is unavailable, or `null` when it can proceed.
 * Use this to gate signing controls — never to gate read-only browsing.
 */
export function walletGateReason(status: WalletStatus): string | null {
  return status.canSign ? null : status.message;
}

/**
 * Read-only pages must render regardless of wallet state, so this is always
 * true. It exists to make the intent explicit at call sites and to keep the
 * rule covered by a test.
 */
export function canBrowseReadOnly(_status: WalletStatus): boolean {
  return true;
}
