import type { StellarNetwork } from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const STELLAR_NETWORK =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK as StellarNetwork) ?? "public";

export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon.stellar.org";

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

export const EXPLORER_BASE = `https://stellar.expert/explorer/${
  STELLAR_NETWORK === "public" ? "public" : "testnet"
}`;

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

export function explorerTxUrl(hash: string) {
  return `${EXPLORER_BASE}/tx/${hash}`;
}

export function explorerAccountUrl(publicKey: string) {
  return `${EXPLORER_BASE}/account/${publicKey}`;
}
