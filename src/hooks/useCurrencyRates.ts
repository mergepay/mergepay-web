"use client";

import { useQuery } from "@tanstack/react-query";
import {
  currencyRate,
  type SupportedFiatCurrency,
} from "@/lib/currency";

/**
 * Live crypto-to-fiat conversion rates fetched from CoinGecko's free API.
 *
 * Returns XLM and USDC prices in the user's preferred fiat currency.
 * Falls back to the static indicative rates from `currency.ts` when the
 * API is unavailable or the request times out.
 *
 * Cached with stale-while-revalidate: fresh for 60 s, revalidated in the
 * background on mount/focus, never blocks the UI on first render.
 */

interface CryptoToFiatRates {
  /** Price of 1 XLM in fiat currency. */
  xlm: number;
  /** Price of 1 USDC in fiat currency. */
  usdc: number;
  /** Whether these are live or fallback rates. */
  live: boolean;
}

const COINGECKO_IDS = "stellar,usd-coin" as const;

/**
 * Build the CoinGecko simple/price URL for the requested fiat currency.
 * CoinGecko uses lowercase currency codes (usd, eur, gbp, etc.).
 */
function buildCoinGeckoUrl(currency: SupportedFiatCurrency): string {
  const ids = COINGECKO_IDS;
  const vs = currency.toLowerCase();
  return `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${vs}`;
}

/**
 * Convert the CoinGecko response into our typed shape.
 * CoinGecko returns `{ "stellar": { usd: 0.12 }, "usd-coin": { usd: 1.0 } }`.
 */
function parseCoinGeckoResponse(
  data: Record<string, Record<string, number>>,
  currency: SupportedFiatCurrency
): { xlm: number; usdc: number } | null {
  const code = currency.toLowerCase();
  const xlm = data["stellar"]?.[code];
  const usdc = data["usd-coin"]?.[code];
  if (typeof xlm !== "number" || typeof usdc !== "number") return null;
  if (xlm <= 0 || usdc <= 0) return null;
  return { xlm, usdc };
}

/**
 * Fetch live crypto-to-fiat rates from CoinGecko.
 * Throws on network/parse failure so React Query can retry.
 */
async function fetchCryptoRates(
  currency: SupportedFiatCurrency
): Promise<CryptoToFiatRates> {
  const url = buildCoinGeckoUrl(currency);
  const res = await fetch(url, {
    // Short timeout — this is a nice-to-have display aid, not critical path.
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`CoinGecko responded ${res.status}`);
  }
  const data = (await res.json()) as Record<string, Record<string, number>>;
  const parsed = parseCoinGeckoResponse(data, currency);
  if (!parsed) {
    throw new Error("Unexpected CoinGecko response shape");
  }
  return { ...parsed, live: true };
}

/**
 * Returns fallback (offline) rates using the static indicative values
 * from `currency.ts`. These are deliberately overridable and must never
 * be treated as a settlement quote.
 */
function fallbackRates(currency: SupportedFiatCurrency): CryptoToFiatRates {
  // currencyRate() returns the inverse (fiat→XLM). For display we need
  // the direct XLM→fiat rate. The fallback is ~1/rate, but we keep it
  // simple: the static rates are for the add-expense form's fiat
  // converter. Here we provide a reasonable fallback.
  const fallbackMap: Record<SupportedFiatCurrency, { xlm: number; usdc: number }> = {
    USD: { xlm: 0.12, usdc: 1.0 },
    EUR: { xlm: 0.11, usdc: 0.92 },
    GBP: { xlm: 0.095, usdc: 0.79 },
    CAD: { xlm: 0.16, usdc: 1.37 },
    ARS: { xlm: 120, usdc: 1000 },
    PHP: { xlm: 6.8, usdc: 56 },
  };
  const rates = fallbackMap[currency] ?? { xlm: 0.12, usdc: 1.0 };
  return { ...rates, live: false };
}

export type { CryptoToFiatRates };

/**
 * React Query hook for live crypto-to-fiat conversion rates.
 *
 * Stale-while-revalidate with a 60-second freshness window. The first
 * render always has `data` from the cache (or `undefined` on cold
 * start), so the UI is never blocked. On failure, `data` stays at the
 * last successful value; the hook never errors out to the caller.
 *
 * @example
 * ```tsx
 * const { rates } = useCurrencyRates("USD");
 * if (rates) {
 *   const fiat = rates.xlm * 10; // 10 XLM in USD
 * }
 * ```
 */
export function useCurrencyRates(currency: SupportedFiatCurrency) {
  const query = useQuery<CryptoToFiatRates>({
    queryKey: ["cryptoRates", currency],
    queryFn: () => fetchCryptoRates(currency),
    // Provide initial fallback data so the first render always has rates.
    placeholderData: () => fallbackRates(currency),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    // CoinGecko free tier: max ~10–30 req/min. Don't hammer it.
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    retry: 1,
    // Never let a fetch error bubble up — the UI just uses fallback.
    throwOnError: false,
  });

  const rates = query.data ?? fallbackRates(currency);

  return {
    /** Live or fallback rates. Always available. */
    rates,
    /** Whether the rates are live (true) or static fallback (false). */
    isLive: rates.live,
    /** Whether a fetch is currently in flight (for subtle loading indicators). */
    isFetching: query.isFetching,
  };
}

/**
 * Convert a Stellar asset amount to a fiat-equivalent string.
 * Returns `null` when the amount is unparseable or the rate is unavailable.
 */
export function convertToFiat(
  amount: string | number,
  assetCode: string,
  rates: CryptoToFiatRates
): string | null {
  const num = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(num) || num < 0) return null;

  const code = assetCode.toUpperCase();
  let rate = 0;
  if (code === "XLM") rate = rates.xlm;
  else if (code === "USDC") rate = rates.usdc;
  else return null;

  if (rate <= 0) return null;
  return (num * rate).toFixed(2);
}
