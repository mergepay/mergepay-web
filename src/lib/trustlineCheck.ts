/**
 * Trustline requirement helpers (#370 / #378).
 *
 * A settlement in USDC (or any non-native asset) fails on-chain when the
 * receiving account has no trustline for that asset. The failure only
 * shows up after the user has already been asked to sign, so the app
 * checks ahead of time and prompts.
 *
 * The *decision* — which configured assets the wallet cannot hold — is a
 * pure function over Horizon balances, kept here so the banner's render
 * and its hook share one answer and it can be tested without a DOM.
 * Fetching lives in `src/hooks/useTrustlineCheck.ts`.
 */

import type { TrustlineAsset } from "./trustline";

export type TrustlineStatus = "ready" | "missing";

export interface TrustlineSummary {
  /** `"missing"` when at least one configured asset has no trustline. */
  status: TrustlineStatus;
  /** Every configured asset the wallet cannot currently receive. */
  missing: TrustlineAsset[];
}

/**
 * Assets the wallet cannot hold yet. Native XLM is never included —
 * `calculateAssetBalances` marks it as always trusted.
 */
export function findMissingTrustlines(
  assets: TrustlineAsset[] | null | undefined
): TrustlineAsset[] {
  if (!Array.isArray(assets)) return [];
  return assets.filter((asset) => asset && asset.hasTrustline === false);
}

export function summarizeTrustlines(
  assets: TrustlineAsset[] | null | undefined
): TrustlineSummary {
  const missing = findMissingTrustlines(assets);
  return { status: missing.length > 0 ? "missing" : "ready", missing };
}

/**
 * Only assets with a concrete issuer can be added: `changeTrust` needs
 * the issuer public key. XLM has no issuer and never appears here.
 */
export function isAddableTrustline(asset: TrustlineAsset): boolean {
  return (
    asset.hasTrustline === false &&
    typeof asset.issuer === "string" &&
    asset.issuer.length > 0
  );
}

/** Human list for the banner heading, e.g. `"USDC and ARST"`. */
export function formatMissingAssetList(missing: TrustlineAsset[]): string {
  const codes = missing.map((asset) => asset.code);
  if (codes.length === 0) return "";
  if (codes.length === 1) return codes[0];
  return `${codes.slice(0, -1).join(", ")} and ${codes[codes.length - 1]}`;
}
