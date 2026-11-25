/**
 * Currency Conversion Helper Module
 *
 * Provides robust multi-currency rate calculation, Zod validation schemas
 * for rate payloads, pure conversion functions handling edge cases (zero amounts,
 * rate fluctuations, precision), and fallback indicators for offline or API failure states.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod Validation Schemas
// ---------------------------------------------------------------------------

/**
 * Zod schema validating exchange rate payloads from external APIs or internal providers.
 */
export const RatePayloadSchema = z.object({
  rates: z.record(z.string(), z.number().positive("Exchange rates must be strictly positive")),
  baseAsset: z.string().min(1, "Base asset is required").default("USD"),
  timestamp: z.number().default(() => Date.now()),
  live: z.boolean().default(true),
  sources: z.array(z.string()).optional(),
});

export type RatePayload = z.infer<typeof RatePayloadSchema>;

/**
 * Zod schema for a single currency rate pair.
 */
export const RatePairSchema = z.object({
  from: z.string().min(1, "Source currency code is required"),
  to: z.string().min(1, "Target currency code is required"),
  rate: z.number().positive("Rate must be greater than zero"),
});

export type RatePair = z.infer<typeof RatePairSchema>;

/**
 * Zod schema for conversion requests.
 */
export const ConversionRequestSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  fromAsset: z.string().min(1, "Source asset is required"),
  toAsset: z.string().min(1, "Target asset is required"),
});

export type ConversionRequest = z.infer<typeof ConversionRequestSchema>;

/**
 * Zod schema for structured conversion results.
 */
export const ConversionResultSchema = z.object({
  sourceAmount: z.string(),
  sourceCurrency: z.string(),
  targetAmount: z.string(),
  targetCurrency: z.string(),
  rate: z.number().nonnegative(),
  formatted: z.string(),
  isFallback: z.boolean(),
  error: z.string().nullable().optional(),
});

export type ConversionResult = z.infer<typeof ConversionResultSchema>;

// ---------------------------------------------------------------------------
// Default Fallback Rates
// ---------------------------------------------------------------------------

/**
 * Indicative fallback exchange rates between major Stellar trustlines (XLM, USDC)
 * and popular fiat currencies. Used when the rate API is unreachable or offline.
 */
export const DEFAULT_FALLBACK_RATES: Record<string, number> = {
  // Stellar / Crypto pairs
  "XLM-USDC": 0.12,
  "USDC-XLM": 8.3333333,
  "XLM-XLM": 1.0,
  "USDC-USDC": 1.0,
  // USD base
  "USD-USDC": 1.0,
  "USDC-USD": 1.0,
  "USD-XLM": 8.3333333,
  "XLM-USD": 0.12,
  // Popular fiats vs USD
  "EUR-USD": 1.08,
  "USD-EUR": 0.9259259,
  "GBP-USD": 1.28,
  "USD-GBP": 0.78125,
  "CAD-USD": 0.73,
  "USD-CAD": 1.369863,
  "ARS-USD": 0.001,
  "USD-ARS": 1000.0,
  "PHP-USD": 0.0178,
  "USD-PHP": 56.179775,
  "NGN-USD": 0.000625,
  "USD-NGN": 1600.0,
};

// ---------------------------------------------------------------------------
// Helpers & Pure Calculation Functions
// ---------------------------------------------------------------------------

/**
 * Normalize an asset or currency code (e.g. "xlm" -> "XLM").
 */
export function normalizeCurrencyCode(code: string): string {
  return (code || "").trim().toUpperCase();
}

/**
 * Construct a standardized pair key (e.g. "XLM-USDC").
 */
export function makePairKey(from: string, to: string): string {
  return `${normalizeCurrencyCode(from)}-${normalizeCurrencyCode(to)}`;
}

/**
 * Safe validator for rate payload inputs.
 */
export function validateRatePayload(data: unknown) {
  return RatePayloadSchema.safeParse(data);
}

/**
 * Resolves the conversion rate between two currencies using direct, inverse,
 * cross-rate (via USD), or fallback mappings.
 *
 * @returns Object with the numeric rate and whether it came from a fallback source, or null if unresolvable.
 */
export function resolveRate(
  fromAsset: string,
  toAsset: string,
  rates?: Record<string, number> | RatePayload | null,
  fallbackRates: Record<string, number> = DEFAULT_FALLBACK_RATES
): { rate: number; isFallback: boolean } | null {
  const from = normalizeCurrencyCode(fromAsset);
  const to = normalizeCurrencyCode(toAsset);

  if (!from || !to) return null;
  if (from === to) return { rate: 1.0, isFallback: false };

  // Extract raw rates map and determine if primary is live
  let liveMap: Record<string, number> | undefined;
  let isPrimaryLive = true;

  if (rates && typeof rates === "object") {
    if ("rates" in rates && typeof rates.rates === "object") {
      liveMap = rates.rates;
      isPrimaryLive = (rates as RatePayload).live !== false;
    } else {
      liveMap = rates as Record<string, number>;
    }
  }

  // 1. Try finding rate in primary live map
  if (liveMap) {
    const rate = findRateInMap(from, to, liveMap);
    if (rate !== null && Number.isFinite(rate) && rate > 0) {
      return { rate, isFallback: !isPrimaryLive };
    }
  }

  // 2. Try finding rate in fallback map
  const fallbackRate = findRateInMap(from, to, fallbackRates);
  if (fallbackRate !== null && Number.isFinite(fallbackRate) && fallbackRate > 0) {
    return { rate: fallbackRate, isFallback: true };
  }

  return null;
}

/**
 * Helper to look up direct, inverse, or cross rates (via USD) in a given rate dictionary.
 */
function findRateInMap(from: string, to: string, map: Record<string, number>): number | null {
  // Direct pair
  const directKey = `${from}-${to}`;
  if (typeof map[directKey] === "number" && map[directKey] > 0) {
    return map[directKey];
  }

  // Inverse pair
  const inverseKey = `${to}-${from}`;
  if (typeof map[inverseKey] === "number" && map[inverseKey] > 0) {
    return 1 / map[inverseKey];
  }

  // Cross-rate via USD
  if (from !== "USD" && to !== "USD") {
    const fromToUsd = findDirectOrInverse(from, "USD", map);
    const usdToTarget = findDirectOrInverse("USD", to, map);

    if (fromToUsd !== null && usdToTarget !== null) {
      return fromToUsd * usdToTarget;
    }
  }

  return null;
}

function findDirectOrInverse(from: string, to: string, map: Record<string, number>): number | null {
  if (from === to) return 1.0;
  const direct = map[`${from}-${to}`];
  if (typeof direct === "number" && direct > 0) return direct;
  const inverse = map[`${to}-${from}`];
  if (typeof inverse === "number" && inverse > 0) return 1 / inverse;
  return null;
}

/**
 * Format converted amount with appropriate precision:
 * - Stellar assets (XLM, USDC): default 7 decimal places
 * - Fiat currencies: default 2 decimal places
 */
export function formatAmountWithPrecision(
  value: number,
  currency: string,
  maxDecimals?: number
): string {
  if (!Number.isFinite(value) || value < 0) return "0.00";

  const norm = normalizeCurrencyCode(currency);
  const isStellarAsset = norm === "XLM" || norm === "USDC";
  const decimals = maxDecimals !== undefined ? maxDecimals : isStellarAsset ? 7 : 2;

  // Format fixed decimals without scientific notation
  const fixed = value.toFixed(decimals);
  return fixed;
}

/**
 * Pure function to calculate currency conversion.
 * Handles zero amounts, rate fluctuations, missing pairs, and offline fallbacks.
 *
 * @param amount - Source amount (numeric or string)
 * @param fromAsset - Source currency (e.g. "USD", "XLM")
 * @param toAsset - Target currency (e.g. "USDC", "EUR")
 * @param rates - Live rates dictionary or RatePayload
 * @param options - Custom fallback rates or precision
 */
export function calculateConversion(
  amount: string | number,
  fromAsset: string,
  toAsset: string,
  rates?: Record<string, number> | RatePayload | null,
  options?: {
    fallbackRates?: Record<string, number>;
    precision?: number;
  }
): ConversionResult {
  const from = normalizeCurrencyCode(fromAsset);
  const to = normalizeCurrencyCode(toAsset);

  // Parse and validate amount input
  const strAmount = typeof amount === "number" ? amount.toString() : (amount || "").trim();
  const numAmount = Number(strAmount);

  // Validate numeric format
  if (strAmount === "" || Number.isNaN(numAmount)) {
    return {
      sourceAmount: strAmount,
      sourceCurrency: from,
      targetAmount: "0",
      targetCurrency: to,
      rate: 0,
      formatted: `0 ${to}`,
      isFallback: false,
      error: "Invalid amount format",
    };
  }

  // Reject negative amounts
  if (numAmount < 0) {
    return {
      sourceAmount: strAmount,
      sourceCurrency: from,
      targetAmount: "0",
      targetCurrency: to,
      rate: 0,
      formatted: `0 ${to}`,
      isFallback: false,
      error: "Amount cannot be negative",
    };
  }

  // Resolve conversion rate
  const resolved = resolveRate(from, to, rates, options?.fallbackRates);

  if (!resolved) {
    return {
      sourceAmount: strAmount,
      sourceCurrency: from,
      targetAmount: "0",
      targetCurrency: to,
      rate: 0,
      formatted: `0 ${to}`,
      isFallback: true,
      error: `Exchange rate unavailable for pair ${from}-${to}`,
    };
  }

  const { rate, isFallback } = resolved;

  // Handle zero amounts cleanly
  if (numAmount === 0) {
    const formattedZero = formatAmountWithPrecision(0, to, options?.precision);
    return {
      sourceAmount: strAmount,
      sourceCurrency: from,
      targetAmount: formattedZero,
      targetCurrency: to,
      rate,
      formatted: `${formattedZero} ${to}`,
      isFallback,
      error: null,
    };
  }

  // Perform calculation with protection against floating point anomalies
  const convertedNumeric = numAmount * rate;
  const targetAmount = formatAmountWithPrecision(convertedNumeric, to, options?.precision);

  return {
    sourceAmount: strAmount,
    sourceCurrency: from,
    targetAmount,
    targetCurrency: to,
    rate,
    formatted: `${targetAmount} ${to}`,
    isFallback,
    error: null,
  };
}
