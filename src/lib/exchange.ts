/**
 * Group Currency Conversion Helper and Exchange Rate Utilities.
 *
 * Provides robust multi-currency conversion, cross-asset valuations,
 * and deterministic precision math for Stellar trustline assets (XLM, USDC, etc.).
 */

import { toStroops, fromStroops } from "./split";

export interface ExchangeRates {
  /** Mapping of asset code / pair key to rate (e.g. { 'XLM-USDC': 0.12, 'USDC-XLM': 8.3333333 }) */
  rates: Record<string, number>;
  /** Whether rates are live or indicative/fallback */
  live: boolean;
  /** Timestamp when rates were fetched */
  timestamp: number;
}

/**
 * Normalize an asset code or symbol for lookups (e.g., uppercase, trim).
 */
export function normalizeAssetCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Build a standardized rate pair key.
 */
export function getPairKey(fromAsset: string, toAsset: string): string {
  return `${normalizeAssetCode(fromAsset)}-${normalizeAssetCode(toAsset)}`;
}

/**
 * Convert an amount from one asset to another using provided rates.
 * Preserves Stellar 7-decimal integer precision via BigInt/stroops when possible.
 *
 * @param amount - Decimal string or number amount of the source asset
 * @param fromAsset - Source asset code (e.g., "XLM", "USDC")
 * @param toAsset - Target asset code (e.g., "USDC", "XLM")
 * @param rates - Record of exchange rates or an ExchangeRates object
 * @returns Converted decimal string with 7 decimal places, or null if rate is unavailable/invalid
 */
export function convertAmount(
  amount: string | number,
  fromAsset: string,
  toAsset: string,
  rates: Record<string, number> | ExchangeRates
):/\* null | string \*/ string | null {
  const normalizedFrom = normalizeAssetCode(fromAsset);
  const normalizedTo = normalizeAssetCode(toAsset);

  if (normalizedFrom === normalizedTo) {
    const num = typeof amount === "number" ? amount.toString() : amount.trim();
    try {
      const stroops = toStroops(num);
      if (stroops < 0n) return null;
      return fromStroops(stroops);
    } catch {
      return null;
    }
  }

  let parsedAmount: bigint;
  try {
    const str = typeof amount === "number" ? amount.toString() : amount.trim();
    parsedAmount = toStroops(str);
    if (parsedAmount < 0n) return null;
  } catch {
    return null;
  }

  const rateMap = "rates" in rates ? rates.rates : rates;
  const directKey = getPairKey(normalizedFrom, normalizedTo);
  let rate = rateMap[directKey];

  if (typeof rate !== "number" || isNaN(rate)) {
    const inverseKey = getPairKey(normalizedTo, normalizedFrom);
    const inverseRate = rateMap[inverseKey];
    if (typeof inverseRate === "number" && inverseRate > 0) {
      rate = 1 / inverseRate;
    } else {
      return null;
    }
  }

  if (rate <= 0 || !isFinite(rate)) {
    return null;
  }

  try {
    // rate is factor to multiply `from` to get `to`. E.g., 1 XLM * 0.12 USDC/XLM = 0.12 USDC
    // Using floating point for rate scaling combined with BigInt stroops conversion:
    // parsedAmount is in stroops (10^-7). rate is to/from.
    const sourceValueFloat = Number(parsedAmount) / 10_000_000;
    const targetValueFloat = sourceValueFloat * rate;
    if (isNaN(targetValueFloat) || targetValueFloat < 0) return null;
    return toStroops(targetValueFloat).toString() === "0" && parsedAmount > 0n && rate > 0
      ? fromStroops(1n) // guard against underflow for non-zero min amounts
      : fromStroops(toStroops(targetValueFloat));
  } catch {
    return null;
  }
}

/**
 * Aggregate total group expenses or balances across mixed asset trustlines into a common base asset.
 */
export function aggregateMixedAmounts(
  items: Array<{ amount: string | number; assetCode: string }>,
  targetAsset: string,
  rates: Record<string, number> | ExchangeRates
): string {
  let totalStroops = 0n;

  for (const item of items) {
    const converted = convertAmount(item.amount, item.assetCode, targetAsset, rates);
    if (converted !== null) {
      try {
        totalStroops += toStroops(converted);
      } catch {
        // skip unparseable conversion results
      }
    }
  }

  return fromStroops(totalStroops);
}
