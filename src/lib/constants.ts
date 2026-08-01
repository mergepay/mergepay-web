import type { StellarNetwork } from "./types";
import {
  CONFIGURED_NETWORK,
  explorerBaseUrl,
} from "./explorer";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * The Stellar network this build targets. Resolved through
 * `normalizeNetwork` so aliases ("mainnet", "pubnet", "test") and
 * unexpected values are handled in exactly one place.
 */
export const STELLAR_NETWORK: StellarNetwork = CONFIGURED_NETWORK;

export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon.stellar.org";

/**
 * Prefix stamped on the memo of every settlement payment, so a Mergepay
 * transaction is identifiable on-chain (`MP:dinner-8f3a`).
 */
export const SETTLEMENT_MEMO_PREFIX = "MP:";

/** Canonical SEP-10 network passphrases, keyed by network. */
export const NETWORK_PASSPHRASES: Record<StellarNetwork, string> = {
  public: "Public Global Stellar Network ; September 2015",
  testnet: "Test SDF Network ; September 2015",
};

/** Human-readable network names, for anything the user reads. */
export const NETWORK_LABELS: Record<StellarNetwork, string> = {
  public: "Stellar Mainnet",
  testnet: "Stellar Testnet",
};

export const NETWORK_PASSPHRASE = NETWORK_PASSPHRASES[STELLAR_NETWORK];

/** The network this app expects every signature to be produced for. */
export const EXPECTED_NETWORK_LABEL = NETWORK_LABELS[STELLAR_NETWORK];

/**
 * Resolve a passphrase back to a known network, or `null` when the wallet
 * is pointed at a custom or futurenet endpoint we cannot name.
 */
export function networkFromPassphrase(
  passphrase: string | null | undefined
): StellarNetwork | null {
  if (!passphrase) return null;
  const match = (Object.keys(NETWORK_PASSPHRASES) as StellarNetwork[]).find(
    (network) => NETWORK_PASSPHRASES[network] === passphrase
  );
  return match ?? null;
}

/**
 * What to call the network a wallet reports. Falls back to the wallet's
 * own name (e.g. "FUTURENET") and finally to a neutral placeholder, so
 * the UI never renders an empty network in an error message.
 */
export function describeNetwork(
  passphrase: string | null | undefined,
  walletNetworkName?: string | null
): string {
  const known = networkFromPassphrase(passphrase);
  if (known) return NETWORK_LABELS[known];
  const name = walletNetworkName?.trim();
  return name ? name : "an unrecognised network";
}

export const EXPLORER_BASE = explorerBaseUrl(STELLAR_NETWORK);

export const STABLE_ASSET = {
  code: process.env.NEXT_PUBLIC_STABLE_ASSET_CODE ?? "USDC",
  issuer:
    process.env.NEXT_PUBLIC_STABLE_ASSET_ISSUER ??
    "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
};

export const XLM_ASSET = { code: "XLM", issuer: null as string | null };

export const SETTLEMENT_ASSETS = [
  XLM_ASSET,
  { code: STABLE_ASSET.code, issuer: STABLE_ASSET.issuer as string | null },
];

export const TOKEN_STORAGE_KEY = "mergepay.token";

/**
 * Explorer helpers live in `./explorer`; re-exported here so existing
 * `@/lib/constants` imports keep working. Both return `null` for
 * missing or malformed identifiers.
 */
export { explorerTxUrl, explorerAccountUrl } from "./explorer";
