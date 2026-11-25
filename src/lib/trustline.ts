/**
 * Multi-Asset Trustline Balancer and Verification Utilities.
 *
 * Stellar assets require an active trustline before an account can receive or hold
 * non-native tokens (e.g. USDC, anchored fiat). XLM is native and always has a trustline.
 *
 * All balance calculations and display formatting adhere strictly to Stellar's 7 decimal
 * places precision (1 stroop = 0.0000001).
 */

import { HORIZON_URL, XLM_ASSET, SETTLEMENT_ASSETS, getUsdcAssetForNetwork } from "./constants";
import type { StellarNetwork } from "./types";
import { toStroops, MAX_DECIMAL_PLACES } from "./money";

export type UsdcTrustlineStatusKind =
  | "confirmed_trusted"
  | "confirmed_missing"
  | "zero_balance_trusted"
  | "unfunded"
  | "error";

export interface UsdcTrustlineStatusResult {
  kind: UsdcTrustlineStatusKind;
  hasTrustline: boolean;
  balance: string;
  assetCode: string;
  assetIssuer: string;
  error?: string;
}

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
 * Compute the subset of required assets whose trustline is missing.
 *
 * Native XLM is always considered to have a trustline, and assets without an
 * issuer are treated as always-available. The result preserves the order of
 * `requiredAssets` so callers can render the banner deterministically.
 */
export function missingTrustlines(
  balances: HorizonBalanceItem[],
  requiredAssets: ConfiguredAsset[]
): ConfiguredAsset[] {
  return requiredAssets.filter(
    (asset) => !verifyTrustline(balances, asset.code, asset.issuer)
  );
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

/**
 * Check whether a connected Stellar account holds an active USDC trustline on the specified network.
 * Differentiates confirmed presence/absence from unfunded accounts and Horizon/RPC network errors.
 */
export async function checkUsdcTrustlineStatus(
  publicKey: string | null | undefined,
  network?: StellarNetwork | string
): Promise<UsdcTrustlineStatusResult> {
  const usdc = getUsdcAssetForNetwork(network);

  if (!publicKey || publicKey.trim() === "") {
    return {
      kind: "unfunded",
      hasTrustline: false,
      balance: "0.0000000",
      assetCode: usdc.code,
      assetIssuer: usdc.issuer,
      error: "No wallet address provided",
    };
  }

  try {
    const horizonUrl = network === "testnet" ? "https://horizon-testnet.stellar.org" : HORIZON_URL;
    const res = await fetch(`${horizonUrl}/accounts/${encodeURIComponent(publicKey.trim())}`);

    if (res.status === 404) {
      return {
        kind: "unfunded",
        hasTrustline: false,
        balance: "0.0000000",
        assetCode: usdc.code,
        assetIssuer: usdc.issuer,
      };
    }

    if (!res.ok) {
      return {
        kind: "error",
        hasTrustline: false,
        balance: "0.0000000",
        assetCode: usdc.code,
        assetIssuer: usdc.issuer,
        error: `Horizon returned status ${res.status}`,
      };
    }

    const data = await res.json();
    const balances: HorizonBalanceItem[] = Array.isArray(data.balances) ? data.balances : [];

    const usdcBalanceItem = balances.find(
      (b) =>
        b.asset_type !== "native" &&
        b.asset_code === usdc.code &&
        b.asset_issuer === usdc.issuer
    );

    if (!usdcBalanceItem) {
      return {
        kind: "confirmed_missing",
        hasTrustline: false,
        balance: "0.0000000",
        assetCode: usdc.code,
        assetIssuer: usdc.issuer,
      };
    }

    const formatted = formatStellarBalance(usdcBalanceItem.balance ?? "0");
    const isZero = formatted === "0.0000000" || parseFloat(formatted) === 0;

    return {
      kind: isZero ? "zero_balance_trusted" : "confirmed_trusted",
      hasTrustline: true,
      balance: formatted,
      assetCode: usdc.code,
      assetIssuer: usdc.issuer,
    };
  } catch (e) {
    return {
      kind: "error",
      hasTrustline: false,
      balance: "0.0000000",
      assetCode: usdc.code,
      assetIssuer: usdc.issuer,
      error: e instanceof Error ? e.message : "Failed to fetch account status",
    };
  }
}
