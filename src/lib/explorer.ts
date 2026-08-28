/**
 * Stellar explorer link construction.
 *
 * Every explorer URL in the app is built here so that:
 *   - links always resolve against the *configured* network rather than
 *     defaulting to mainnet,
 *   - identifiers arriving from the API are treated as untrusted strings
 *     and validated before they are interpolated into a URL, and
 *   - a missing / malformed / not-yet-available identifier yields `null`
 *     instead of a link that 404s on the explorer.
 *
 * This module deliberately has no dependency on `./constants` — the
 * network is resolved from the public env var directly — so that
 * `constants.ts` can build on top of it without an import cycle.
 */

import { StrKey } from "./strkey";

/** Networks the app can be configured against. */
export type StellarNetwork = "public" | "testnet";

/**
 * Aliases accepted for `NEXT_PUBLIC_STELLAR_NETWORK`. Stellar tooling
 * uses several spellings for the same two networks, so we accept the
 * common ones rather than silently falling back.
 */
const NETWORK_ALIASES: Record<string, StellarNetwork> = {
  public: "public",
  pubnet: "public",
  mainnet: "public",
  testnet: "testnet",
  test: "testnet",
};

/**
 * The network used when the environment does not name a recognized one.
 * Kept at `public` to match the historical default of `STELLAR_NETWORK`
 * so an unset env var does not change which network the app talks to.
 */
export const DEFAULT_NETWORK: StellarNetwork = "public";

/**
 * Map a raw configuration value onto a known network. Unrecognized,
 * empty, and missing values fall back to {@link DEFAULT_NETWORK}.
 */
export function normalizeNetwork(
  raw: string | null | undefined
): StellarNetwork {
  if (typeof raw !== "string") return DEFAULT_NETWORK;
  return NETWORK_ALIASES[raw.trim().toLowerCase()] ?? DEFAULT_NETWORK;
}

/** The network this build of the app is configured against. */
export const CONFIGURED_NETWORK: StellarNetwork = normalizeNetwork(
  process.env.NEXT_PUBLIC_STELLAR_NETWORK
);

/** stellar.expert base URL for a given network. */
export function explorerBaseUrl(
  network: StellarNetwork = CONFIGURED_NETWORK
): string {
  return `https://stellar.expert/explorer/${network}`;
}

/**
 * A Stellar transaction hash is a SHA-256 digest: exactly 64 hex
 * characters. Anything else (empty string, truncated hash, a value that
 * would escape the URL path) is rejected.
 */
export function isValidTxHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F]{64}$/.test(value);
}

/** Ed25519 account id check, delegated to the local StrKey helper. */
export function isValidPublicKey(value: unknown): value is string {
  return typeof value === "string" && StrKey.isValidEd25519PublicKey(value);
}

/**
 * Explorer URL for a transaction, or `null` when the hash is absent or
 * malformed. Callers render a non-linked chip in the `null` case.
 */
export function explorerTxUrl(
  hash: string | null | undefined,
  network: StellarNetwork = CONFIGURED_NETWORK
): string | null {
  if (!isValidTxHash(hash)) return null;
  return `${explorerBaseUrl(network)}/tx/${hash.toLowerCase()}`;
}

/**
 * Explorer URL for an account, or `null` when the public key is absent
 * or fails StrKey validation.
 */
export function explorerAccountUrl(
  publicKey: string | null | undefined,
  network: StellarNetwork = CONFIGURED_NETWORK
): string | null {
  if (!isValidPublicKey(publicKey)) return null;
  return `${explorerBaseUrl(network)}/account/${publicKey}`;
}
