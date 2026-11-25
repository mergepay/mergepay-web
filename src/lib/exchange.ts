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
): /* null | string */ string | null {
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

  const rateMap =
    typeof rates === "object" && rates !== null && "rates" in rates
      ? (rates as ExchangeRates).rates
      : (rates as Record<string, number>);

  // parsedAmount is in stroops (10^-7); scale to units for the rate math.
  const sourceValueFloat = Number(parsedAmount) / 10_000_000;

  // Canonical rates are stored "to-per-from" (e.g. "XLM-USDC": 0.12 USDC per
  // XLM). For a from→to conversion prefer the inverse pair and divide (12 USDC
  // / 0.12 = 100 XLM exactly); fall back to the direct pair by multiplying
  // when only it is available.
  const inverseKey = getPairKey(normalizedTo, normalizedFrom);
  const inverseRate = rateMap[inverseKey];
  let targetValueFloat: number;
  if (typeof inverseRate === "number" && inverseRate > 0 && isFinite(inverseRate)) {
    targetValueFloat = sourceValueFloat / inverseRate;
  } else {
    const directKey = getPairKey(normalizedFrom, normalizedTo);
    const directRate = rateMap[directKey];
    if (typeof directRate === "number" && directRate > 0 && isFinite(directRate)) {
      targetValueFloat = sourceValueFloat * directRate;
    } else {
      return null;
    }
  }

  try {
    if (isNaN(targetValueFloat) || targetValueFloat < 0) return null;
    const converted = toStroops(targetValueFloat);
    return converted.toString() === "0" && parsedAmount > 0n
      ? fromStroops(1n) // guard against underflow for non-zero min amounts
      : fromStroops(converted);
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
