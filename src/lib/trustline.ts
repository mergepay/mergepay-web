/**
 * Multi-Asset Trustline Balancer and Verification Utilities.
 *
 * Stellar assets require an active trustline before an account can receive or hold
 * non-native tokens (e.g. USDC, anchored fiat). XLM is native and always has a trustline.
 *
 * All balance calculations and display formatting adhere strictly to Stellar's 7 decimal
 * places precision (1 stroop = 0.0000001).
 */

import { HORIZON_URL, XLM_ASSET, SETTLEMENT_ASSETS } from "./constants";
import { toStroops, MAX_DECIMAL_PLACES } from "./money";

export interface ConfiguredAsset {
  code: string;
  issuer: string | null;
  name?: string;
}

export interface HorizonBalanceItem {
  asset_type: string;
  balance: string;
  asset_code?: string;
  asset_issuer?: string;
  limit?: string;
}

export interface TrustlineAsset {
  code: string;
  issuer: string | null;
  name?: string;
  balance: string;
  hasTrustline: boolean;
  limit?: string;
}

/**
 * Format a numeric balance to strict Stellar 7 decimal places string representation,
 * or keep minimal clean plain decimal string with max 7 decimal places.
 *
 * @example
 *   formatStellarBalance("10")       // -> "10.0000000"
 *   formatStellarBalance("1.234")    // -> "1.2340000"
 *   formatStellarBalance("0")        // -> "0.0000000"
 */
export function formatStellarBalance(balance: string | number): string {
  const raw = typeof balance === "number" ? balance.toString() : balance;
  if (!raw || raw.trim() === "") return "0.0000000";

  const cleaned = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return "0.0000000";

  const dotIdx = cleaned.indexOf(".");
  if (dotIdx === -1) {
    return `${cleaned}.0000000`;
  }

  const intPart = cleaned.slice(0, dotIdx);
  const fracPart = cleaned.slice(dotIdx + 1).padEnd(MAX_DECIMAL_PLACES, "0").slice(0, MAX_DECIMAL_PLACES);

  return `${intPart}.${fracPart}`;
}

/**
 * Verify whether an account holds an active trustline for a given asset.
 * XLM is native and is always considered to have an active trustline.
 */
export function verifyTrustline(
  balances: HorizonBalanceItem[],
  assetCode: string,
  assetIssuer: string | null
): boolean {
  if (assetCode === XLM_ASSET.code || assetIssuer === null) {
    return true;
  }

  return balances.some(
    (b) =>
      b.asset_type !== "native" &&
      b.asset_code === assetCode &&
      b.asset_issuer === assetIssuer
  );
}

/**
 * Calculate multi-asset trustline states and balances for a set of configured assets.
 */
export function calculateAssetBalances(
  horizonBalances: HorizonBalanceItem[],
  configuredAssets: ConfiguredAsset[] = SETTLEMENT_ASSETS
): TrustlineAsset[] {
  return configuredAssets.map((asset) => {
    const isNative = asset.code === XLM_ASSET.code || asset.issuer === null;

    if (isNative) {
      const nativeBalance = horizonBalances.find((b) => b.asset_type === "native");
      return {
        code: asset.code,
        issuer: null,
        name: asset.name ?? "Lumen",
        balance: formatStellarBalance(nativeBalance?.balance ?? "0"),
        hasTrustline: true,
        limit: nativeBalance?.limit,
      };
    }

    const match = horizonBalances.find(
      (b) =>
        b.asset_type !== "native" &&
        b.asset_code === asset.code &&
        b.asset_issuer === asset.issuer
    );

    return {
      code: asset.code,
      issuer: asset.issuer,
      name: asset.name ?? asset.code,
      balance: formatStellarBalance(match?.balance ?? "0"),
      hasTrustline: Boolean(match),
      limit: match?.limit,
    };
  });
}

/**
 * Fetch Horizon balances for a given Stellar public key.
 */
export async function fetchHorizonAccountBalances(
  publicKey: string
): Promise<HorizonBalanceItem[]> {
  if (!publicKey || publicKey.trim() === "") return [];

  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(publicKey)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.balances) ? data.balances : [];
  } catch {
    return [];
  }
}
