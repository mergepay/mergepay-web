/**
 * Currency conversion and display helper for XLM and USDC balances.
 *
 * Provides formatting utilities that combine token amount formatting (with Stellar 7 decimal precision)
 * and optional fiat equivalents derived from fetched exchange rate data, gracefully handling loading
 * or missing rates without layout shifts.
 */

import { formatAssetAmount } from "./currency";
import { fromStroops, toStroops } from "./split";
import { convertAmount, getPairKey, type ExchangeRates } from "./exchange";

export interface FiatConversionOptions {
  /** Target fiat currency code (e.g. "USD", "EUR"). Defaults to "USD". */
  fiatCurrency?: string;
  /** Exchange rates map: asset code (e.g. "XLM", "USDC") -> rate number in fiat per unit. */
  rates?: Record<string, number | null | undefined> | null;
  /** Whether exchange rates are currently loading. */
  isLoading?: boolean;
  /** Optional override for fiat symbol (e.g. "$", "€"). */
  fiatSymbol?: string;
  /** Minimum decimal places for fiat display. Defaults to 2. */
  fiatDecimals?: number;
}

export interface ConvertedBalanceDisplay {
  /** Formatted token amount string with ticker (e.g. "12.50 XLM"). */
  tokenText: string;
  /** Formatted fiat equivalent string or loading/placeholder indicator (e.g. "~$1.50 USD" or "..."). */
  fiatText: string | null;
  /** Whether the fiat estimate is currently available. */
  hasFiat: boolean;
  /** Whether exchange rates are loading. */
  isLoading: boolean;
  /** Accessible label combining both token and fiat information. */
  accessibilityLabel: string;
}

const DEFAULT_FIAT_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "$",
  AUD: "$",
  JPY: "¥",
};

/**
 * Format a balance amount (XLM or USDC) alongside its approximate fiat equivalent.
 *
 * @param amountRaw - The raw decimal amount string or number.
 * @param assetCode - The Stellar asset code ("XLM", "USDC", etc.).
 * @param options - Conversion options including rates, loading state, and target fiat currency.
 */
export function formatBalanceWithFiat(
  amountRaw: string | number | null | undefined,
  assetCode: string | null | undefined,
  options: FiatConversionOptions = {}
): ConvertedBalanceDisplay {
  const fiatCurrency = (options.fiatCurrency ?? "USD").toUpperCase();
  const fiatSymbol =
    options.fiatSymbol ?? DEFAULT_FIAT_SYMBOLS[fiatCurrency] ?? `${fiatCurrency} `;
  const decimals = options.fiatDecimals ?? 2;

  const tokenFormatted = formatAssetAmount(amountRaw, assetCode);
  const numericAmount = Number(typeof amountRaw === "string" ? amountRaw : amountRaw ?? 0);

  if (options.isLoading) {
    return {
      tokenText: tokenFormatted.text,
      fiatText: "…",
      hasFiat: false,
      isLoading: true,
      accessibilityLabel: `${tokenFormatted.label}, fiat equivalent loading`,
    };
  }

  const normalizedAsset = (assetCode ?? "").trim().toUpperCase();
  const rate = options.rates?.[normalizedAsset];

  if (rate == null || Number.isNaN(rate) || !tokenFormatted.valid || Number.isNaN(numericAmount)) {
    return {
      tokenText: tokenFormatted.text,
      fiatText: null,
      hasFiat: false,
      isLoading: false,
      accessibilityLabel: tokenFormatted.label,
    };
  }

  const fiatVal = numericAmount * rate;
  const formattedFiat = fiatVal.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const fiatText = `~${fiatSymbol}${formattedFiat} ${fiatCurrency}`;

  return {
    tokenText: tokenFormatted.text,
    fiatText,
    hasFiat: true,
    isLoading: false,
    accessibilityLabel: `${tokenFormatted.label}, approximately ${fiatSymbol}${formattedFiat} ${fiatCurrency}`,
  };
}

/** The XLM/USDC-to-fiat pair `useCurrencyRates` resolves, narrowed to what an
 *  asset-to-asset conversion needs. Declared here rather than imported from the
 *  hook so `src/lib/` never depends on `src/hooks/`. */
export interface AssetFiatPair {
  xlm: number;
  usdc: number;
  /** Whether the pair came from the live feed or the offline fallback. */
  live?: boolean;
}

/**
 * Express an XLM/USDC-to-fiat pair as the asset-to-asset rate map
 * `convertAmount` reads.
 *
 * There is no XLM/USDC feed — the app only ever has each asset's fiat price —
 * so the cross rate is derived here rather than fetched: 1 XLM is
 * `xlm / usdc` USDC. Doing the division in one place keeps every consumer
 * from re-deriving it slightly differently, and returning `null` for a
 * non-positive or non-finite price means a caller cannot accidentally divide
 * by a placeholder rate and display an infinite balance.
 *
 * Both pair directions are emitted because `convertAmount` prefers the inverse
 * key and divides (it keeps the rounding on the side the caller asked for).
 */
export function assetExchangeRates(
  pair: AssetFiatPair | null | undefined,
  timestamp = 0
): ExchangeRates | null {
  const xlm = pair?.xlm;
  const usdc = pair?.usdc;
  if (
    typeof xlm !== "number" ||
    typeof usdc !== "number" ||
    !Number.isFinite(xlm) ||
    !Number.isFinite(usdc) ||
    xlm <= 0 ||
    usdc <= 0
  ) {
    return null;
  }
  return {
    rates: {
      [getPairKey("XLM", "USDC")]: xlm / usdc,
      [getPairKey("USDC", "XLM")]: usdc / xlm,
    },
    live: pair?.live ?? false,
    timestamp,
  };
}

/**
 * Convert one asset's amount into another, keeping the sign.
 *
 * `convertAmount` rejects a negative amount, which is right for an expense
 * (a payment is never less than nothing) and wrong for a balance summary
 * (a net position is negative whenever the member owes). Converting the
 * magnitude and re-attaching the sign is exact — the sign never enters the
 * rate maths, so there is nothing to round differently — and it means the
 * signed figures this helper exists to display do not silently become null.
 *
 * A missing rate map is accepted and yields null: before the fiat feed has
 * answered, "no rates" is the normal state rather than a caller error, and a
 * display helper that threw would take the whole group view with it.
 */
export function convertBalanceAmount(
  amount: string | number | null | undefined,
  fromAsset: string,
  toAsset: string,
  rates: Record<string, number> | ExchangeRates | null | undefined
): string | null {
  if (rates == null) return null;
  const raw = typeof amount === "number" ? amount.toFixed(7) : (amount ?? "").trim();
  if (!raw) return null;
  const negative = raw.startsWith("-");
  const converted = convertAmount(negative ? raw.slice(1) : raw, fromAsset, toAsset, rates);
  if (converted === null) return null;
  if (!negative) return converted;
  try {
    return fromStroops(-toStroops(converted));
  } catch {
    return null;
  }
}

export interface AssetEquivalentOptions {
  /** Minimum fraction digits. Defaults to 2 — an estimate is never precise enough to show 7. */
  minDecimals?: number;
  /** Maximum fraction digits. Defaults to 4. */
  maxDecimals?: number;
  /** BCP-47 locale for separators. */
  locale?: string;
  /** Prefix glyph. Defaults to "≈". */
  prefix?: string;
}

/**
 * Render one asset's amount as an equivalent figure in another asset,
 * e.g. `"-80.0000000" XLM → "≈ -10.00 USDC"`.
 *
 * This is the display half of the conversion helpers: it returns the full
 * string (prefix, grouped decimal, asset code label) or `null` when there is
 * nothing honest to show, so a caller renders the whole `<span>` conditionally
 * instead of first checking the rate and then re-formatting it. Estimates are
 * truncated to fewer decimals than exact balances on purpose — 4 digits of a
 * derived cross rate reads as false precision next to `formatAssetAmount`'s
 * canonical 7.
 */
export function formatAssetEquivalent(
  amount: string | number | null | undefined,
  fromAsset: string,
  toAsset: string,
  rates: Record<string, number> | ExchangeRates | null | undefined,
  options: AssetEquivalentOptions = {}
): string | null {
  const converted = convertBalanceAmount(amount, fromAsset, toAsset, rates);
  if (converted === null) return null;
  const formatted = formatAssetAmount(converted, toAsset, {
    locale: options.locale,
    minDecimals: options.minDecimals ?? 2,
    maxDecimals: options.maxDecimals ?? 4,
  });
  if (!formatted.valid) return null;
  return `${options.prefix ?? "≈"} ${formatted.text}`;
}

/**
 * Sum signed amounts held in mixed assets as one figure in `targetAsset`.
 *
 * Returns `null` when any single item cannot be converted. A total that quietly
 * omitted the USDC leg because its rate was missing would still look like a
 * total, and in a money UI a plausible wrong number is worse than no number —
 * the caller shows nothing instead.
 *
 * The accumulation is integer stroop arithmetic (`toStroops`/`fromStroops`),
 * not float addition, so a hundred rows do not drift the last decimal.
 */
export function aggregateBalancesInAsset(
  items: Array<{ amount: string | number | null | undefined; assetCode: string }>,
  targetAsset: string,
  rates: Record<string, number> | ExchangeRates | null | undefined
): string | null {
  if (rates == null || items.length === 0) return null;
  let total = BigInt(0);
  for (const item of items) {
    const converted = convertBalanceAmount(item.amount, item.assetCode, targetAsset, rates);
    if (converted === null) return null;
    try {
      total += toStroops(converted);
    } catch {
      return null;
    }
  }
  return fromStroops(total);
}
