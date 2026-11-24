import { formatAssetAmount } from "./currency";

export const TICKER_FIAT = ["USD", "EUR", "GBP", "CAD"] as const;
export type TickerFiat = (typeof TICKER_FIAT)[number];
export type TickerAsset = "XLM" | "USDC";
export type TickerRates = Record<string, number>;

export function tickerRateKey(asset: TickerAsset, fiat: TickerFiat): string {
  return `${asset}-${fiat}`;
}

/** Reject malformed provider data instead of displaying fabricated conversions. */
export function parseTickerRates(payload: unknown): TickerRates {
  if (!payload || typeof payload !== "object") throw new Error("Invalid exchange-rate payload");
  const data = payload as Record<string, unknown>;
  const stellar = data.stellar;
  const usdCoin = data["usd-coin"];
  if (!stellar || typeof stellar !== "object" || !usdCoin || typeof usdCoin !== "object") {
    throw new Error("Missing exchange-rate assets");
  }
  const result: TickerRates = {};
  for (const [asset, raw] of [["XLM", stellar], ["USDC", usdCoin]] as const) {
    const values = raw as Record<string, unknown>;
    for (const fiat of TICKER_FIAT) {
      const rate = values[fiat.toLowerCase()];
      if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
        result[tickerRateKey(asset, fiat)] = rate;
      }
    }
  }
  if (Object.keys(result).length === 0) throw new Error("No valid exchange rates");
  return result;
}

export function formatTickerRate(rate: number | null | undefined, fiat: TickerFiat): string {
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: fiat, maximumFractionDigits: rate < 0.01 ? 6 : 4,
  }).format(rate);
}

export function formatTickerConversion(
  amount: string | number | undefined,
  rate: number | undefined,
  fiat: TickerFiat,
): string | null {
  if (amount === undefined || typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
  const parsed = formatAssetAmount(amount);
  if (!parsed.valid) return null;
  const numeric = Number(String(amount));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const converted = numeric * rate;
  return Number.isFinite(converted)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: fiat, maximumFractionDigits: 2 }).format(converted)
    : null;
}
