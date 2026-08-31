/**
 * Currency conversion and display helper for XLM and USDC balances.
 *
 * Provides formatting utilities that combine token amount formatting (with Stellar 7 decimal precision)
 * and optional fiat equivalents derived from fetched exchange rate data, gracefully handling loading
 * or missing rates without layout shifts.
 */

import { formatAssetAmount } from "./currency";

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
