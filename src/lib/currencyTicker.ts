/**
 * Presentation helpers for the compact exchange-rate ticker (#888).
 *
 * The ticker must never block or disappear because the rate feed is down, so
 * the fallback values live here (not in the component) and are used whenever
 * the feed is missing or malformed. Keeping the decision pure also means the
 * fallback path is testable without mocking React Query or CoinGecko.
 */

/** The two assets Mergepay splits and settles in. */
export type TickerAssetCode = "XLM" | "USDC";

export interface TickerFiatRates {
  /** Price of 1 XLM in the display fiat currency. */
  xlm: number;
  /** Price of 1 USDC in the display fiat currency. */
  usdc: number;
  /** Whether these came from the live feed. */
  live?: boolean;
}

export interface TickerRate {
  assetCode: TickerAssetCode;
  rate: number;
}

/**
 * Indicative USD prices used when the feed has not answered yet.
 *
 * These are display-only and deliberately coarse: they exist so the ticker
 * can render a stable row instead of a skeleton, and the UI labels them as
 * indicative so they are never mistaken for a settlement quote.
 */
export const FALLBACK_TICKER_FIAT_RATES: TickerFiatRates = {
  xlm: 0.12,
  usdc: 1,
};

function isUsableRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Turn a fiat-rate payload into the two ticker rows, falling back to the
 * static indicative values when either leg is missing or invalid.
 *
 * Both legs are required: showing a live XLM price next to a fallback USDC
 * price would make the pair look internally consistent when it is not.
 */
export function buildTickerRates(
  rates: TickerFiatRates | null | undefined
): TickerRate[] {
  const source =
    isUsableRate(rates?.xlm) && isUsableRate(rates?.usdc)
      ? rates
      : FALLBACK_TICKER_FIAT_RATES;

  return [
    { assetCode: "XLM", rate: source.xlm },
    { assetCode: "USDC", rate: source.usdc },
  ];
}

/**
 * Format a fiat price for a compact badge.
 *
 * Very small prices keep four significant decimals rather than rounding to
 * `0.00`, and large values use grouping so the row stays readable.
 */
export function formatTickerRate(rate: number): string {
  if (!Number.isFinite(rate) || rate < 0) return "—";
  if (rate >= 1000) {
    return rate.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (rate < 0.01) return rate.toFixed(4);
  return rate.toFixed(3);
}
