// Vitest suite for currency formatting and conversion (issue #610).
//
// `.vitest.test.tsx` keeps this file out of the `tsx --test
// src/lib/__tests__/*.test.ts` glob that `npm test` also runs; see the note in
// balanceCalculation.vitest.test.tsx. Everything here is pure.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AMOUNT_UNAVAILABLE,
  amountToStroops,
  convertCurrency,
  currencyRate,
  formatAssetAmount,
  formatAssetAmountText,
  formatStellarAssetAmount,
  normalizeAssetCode,
  parseDecimalDigits,
  rateDeviationPercent,
} from "../currency";
import {
  aggregateBalancesInAsset,
  assetExchangeRates,
  convertBalanceAmount,
  formatAssetEquivalent,
  formatBalanceWithFiat,
} from "../currencyConversion";
import { aggregateMixedAmounts, convertAmount, getPairKey } from "../exchange";
import {
  avatarColor,
  formatAmount,
  formatCurrencyAmount,
  formatMoney,
  fullDate,
  fullDateLabel,
  initials,
  shortHash,
  shortKey,
  timeAgo,
} from "../format";
import { formatCurrency } from "../settlementFormatting";

/** 1 XLM = 0.12 USDC, derived the way the app derives it. */
const RATES = assetExchangeRates({ xlm: 0.12, usdc: 1 }, 1_700_000_000_000)!;

// ---------------------------------------------------------------------------
// currency.ts: reading amounts
// ---------------------------------------------------------------------------

describe("parseDecimalDigits", () => {
  it("splits a plain decimal into sign, integer and fraction", () => {
    expect(parseDecimalDigits("12.50")).toEqual({ negative: false, int: "12", frac: "50" });
    expect(parseDecimalDigits("-0.5")).toEqual({ negative: true, int: "0", frac: "5" });
    expect(parseDecimalDigits("+3")).toEqual({ negative: false, int: "3", frac: "" });
  });

  it("accepts a leading or trailing dot", () => {
    expect(parseDecimalDigits(".5")).toEqual({ negative: false, int: "0", frac: "5" });
    expect(parseDecimalDigits("5.")).toEqual({ negative: false, int: "5", frac: "" });
  });

  it("reads numbers, including ones JavaScript prints in exponential form", () => {
    expect(parseDecimalDigits(1.5)).toEqual({ negative: false, int: "1", frac: "5" });
    expect(parseDecimalDigits(1e-7)).toEqual({ negative: false, int: "0", frac: "0000001" });
  });

  it("expands exponential notation exactly", () => {
    expect(parseDecimalDigits("1.5E+3")).toEqual({ negative: false, int: "1500", frac: "" });
    expect(parseDecimalDigits("1e5")).toEqual({ negative: false, int: "100000", frac: "" });
    expect(parseDecimalDigits("1.234e1")).toEqual({ negative: false, int: "12", frac: "34" });
    expect(parseDecimalDigits("-2e-3")).toEqual({ negative: true, int: "0", frac: "002" });
  });

  it("returns null for anything that is not a number", () => {
    for (const bad of ["", "   ", "abc", ".", "-", "1e", "1.2.3", "1,5", "--1"]) {
      expect(parseDecimalDigits(bad)).toBeNull();
    }
    for (const bad of [Number.NaN, Infinity, -Infinity, null, undefined, {} as unknown as string]) {
      expect(parseDecimalDigits(bad)).toBeNull();
    }
  });
});

describe("normalizeAssetCode", () => {
  it("trims and upper-cases", () => {
    expect(normalizeAssetCode(" usdc ")).toBe("USDC");
  });

  it("returns null when there is no usable code", () => {
    for (const bad of ["", "   ", null, undefined, 5 as unknown as string]) {
      expect(normalizeAssetCode(bad)).toBeNull();
    }
  });
});

describe("amountToStroops", () => {
  it("is exact and signed", () => {
    expect(amountToStroops("1.5")).toBe(BigInt(15_000_000));
    expect(amountToStroops("-1.5")).toBe(BigInt(-15_000_000));
    expect(amountToStroops("0")).toBe(BigInt(0));
    expect(amountToStroops(1e-7)).toBe(BigInt(1));
  });

  it("rounds past the seventh decimal half away from zero", () => {
    expect(amountToStroops("0.123456789")).toBe(BigInt(1_234_568));
    expect(amountToStroops("-0.123456789")).toBe(BigInt(-1_234_568));
    expect(amountToStroops("0.00000005")).toBe(BigInt(1));
    expect(amountToStroops("0.00000004")).toBe(BigInt(0));
  });

  it("is null for unreadable input", () => {
    for (const bad of ["abc", "", null, undefined]) expect(amountToStroops(bad)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// currency.ts: formatting
// ---------------------------------------------------------------------------

describe("formatAssetAmount", () => {
  it("shows two decimals at minimum, with the asset", () => {
    expect(formatAssetAmount("1.5", "XLM")).toEqual({
      amount: "1.50",
      asset: "XLM",
      text: "1.50 XLM",
      label: "1.50 XLM",
      valid: true,
    });
  });

  it("renders equivalent inputs identically", () => {
    const outputs = ["1.5", "1.50", "1.5000000", 1.5, "01.5"].map((v) => formatAssetAmount(v, "XLM").text);

    expect(new Set(outputs)).toEqual(new Set(["1.50 XLM"]));
  });

  it("groups thousands", () => {
    expect(formatAssetAmount("1234567.891", "USDC").text).toBe("1,234,567.891 USDC");
    expect(formatAssetAmount("1000000", "USDC").text).toBe("1,000,000.00 USDC");
  });

  it("never drops a significant digit of a sub-cent value", () => {
    expect(formatAssetAmount("0.0000001", "XLM").text).toBe("0.0000001 XLM");
  });

  it("rounds half away from zero on exact decimal digits", () => {
    expect(formatAssetAmount("2.675", "XLM", { maxDecimals: 2 }).amount).toBe("2.68");
    expect(formatAssetAmount("-2.675", "XLM", { maxDecimals: 2 }).amount).toBe("-2.68");
    expect(formatAssetAmount("2.674", "XLM", { maxDecimals: 2 }).amount).toBe("2.67");
    expect(formatAssetAmount("0.005", "XLM", { maxDecimals: 2 }).amount).toBe("0.01");
    expect(formatAssetAmount("0.004", "XLM", { maxDecimals: 2 }).amount).toBe("0.00");
    expect(formatAssetAmount("0.123456789", "XLM").amount).toBe("0.1234568");
  });

  it("carries a rounding overflow into the integer part", () => {
    expect(formatAssetAmount("9.999", "XLM", { maxDecimals: 2 }).amount).toBe("10.00");
    expect(formatAssetAmount("2.5", "XLM", { maxDecimals: 0 }).amount).toBe("3");
  });

  it("does not print the float noise of 0.1 + 0.2", () => {
    expect(formatAssetAmount(0.1 + 0.2, "XLM").amount).toBe("0.30");
  });

  it("never shows a negative zero", () => {
    expect(formatAssetAmount("-0.0000000004", "XLM").amount).toBe("0.00");
    expect(formatAssetAmount("-0", "XLM").amount).toBe("0.00");
  });

  it("honours signDisplay but never signs zero", () => {
    expect(formatAssetAmount("5", "XLM", { signDisplay: "always" }).text).toBe("+5.00 XLM");
    expect(formatAssetAmount("-5", "XLM", { signDisplay: "always" }).text).toBe("-5.00 XLM");
    expect(formatAssetAmount("0", "XLM", { signDisplay: "always" }).text).toBe("0.00 XLM");
  });

  it("applies min and max decimals, clamped to what a stroop can hold", () => {
    expect(formatAssetAmount("1.5", undefined, { minDecimals: 4 }).amount).toBe("1.5000");
    expect(formatAssetAmount("1.23456", undefined, { maxDecimals: 3 }).amount).toBe("1.235");
    expect(formatAssetAmount("1.5", undefined, { minDecimals: 5, maxDecimals: 3 }).amount).toBe("1.500");
    expect(formatAssetAmount("1.123456789", undefined, { maxDecimals: 99 }).amount).toBe("1.1234568");
    expect(formatAssetAmount("1.123456789", undefined, { maxDecimals: Number.NaN }).amount).toBe(
      "1.1234568",
    );
    expect(formatAssetAmount("1.5", undefined, { minDecimals: -3 }).amount).toBe("1.5");
  });

  it("uses the separators of the requested locale, and falls back for an unknown one", () => {
    expect(formatAssetAmount("1234.5", "EUR", { locale: "de-DE" }).text).toBe("1.234,50 EUR");
    expect(formatAssetAmount("1234.5", "EUR", { locale: "not a locale!" }).text).toBe("1,234.50 EUR");
  });

  it("reports an unreadable amount without inventing a zero", () => {
    expect(formatAssetAmount("abc", "USDC")).toEqual({
      amount: AMOUNT_UNAVAILABLE,
      asset: "USDC",
      text: AMOUNT_UNAVAILABLE,
      label: "Amount unavailable (USDC)",
      valid: false,
    });
    expect(formatAssetAmount(null).label).toBe("Amount unavailable");
  });

  it("tells assistive technology when the asset is missing, but not when it was left out on purpose", () => {
    expect(formatAssetAmount("5", null)).toMatchObject({ text: "5.00", label: "5.00 unknown asset" });
    expect(formatAssetAmount("5", "")).toMatchObject({ label: "5.00 unknown asset" });
    expect(formatAssetAmount("5")).toMatchObject({ text: "5.00", label: "5.00" });
  });

  it("normalises the asset code", () => {
    expect(formatAssetAmount("1", " usdc ").text).toBe("1.00 USDC");
  });
});

describe("formatAssetAmountText / formatStellarAssetAmount", () => {
  it("formatAssetAmountText is the on-screen string", () => {
    expect(formatAssetAmountText("2", "USDC")).toBe("2.00 USDC");
  });

  it("keeps the issuer of an issued asset, trimmed", () => {
    expect(formatStellarAssetAmount("5", { assetCode: "USDC", assetIssuer: " GABC " })).toMatchObject({
      text: "5.00 USDC",
      issuer: "GABC",
    });
  });

  it("has no issuer for native XLM, a missing issuer or a blank one", () => {
    expect(formatStellarAssetAmount("5", { assetCode: "XLM", assetIssuer: "GABC" }).issuer).toBeNull();
    expect(formatStellarAssetAmount("5", { assetCode: "USDC", assetIssuer: null }).issuer).toBeNull();
    expect(formatStellarAssetAmount("5", { assetCode: "USDC", assetIssuer: "  " }).issuer).toBeNull();
    expect(formatStellarAssetAmount("5", { assetCode: "USDC" }).issuer).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// currency.ts: fiat helpers
// ---------------------------------------------------------------------------

describe("currencyRate / convertCurrency / rateDeviationPercent", () => {
  it("exposes an indicative rate per supported fiat currency", () => {
    expect(currencyRate("USD")).toBe(1);
    expect(currencyRate("EUR")).toBe(1.09);
  });

  it("converts and trims trailing zeros", () => {
    expect(convertCurrency("10", "EUR")).toBe("10.9");
    expect(convertCurrency("100", "USD")).toBe("100");
    expect(convertCurrency(0, "USD")).toBe("0");
    expect(convertCurrency("3", "USD", 2)).toBe("6");
    expect(convertCurrency(1.5, "GBP")).toBe("1.905");
  });

  it("refuses a negative amount, a bad amount or a bad rate", () => {
    expect(convertCurrency("-1", "USD")).toBeNull();
    expect(convertCurrency("abc", "USD")).toBeNull();
    expect(convertCurrency("1", "USD", 0)).toBeNull();
    expect(convertCurrency("1", "USD", -2)).toBeNull();
    expect(convertCurrency("1", "USD", Number.NaN)).toBeNull();
  });

  it("measures how far an override is from the market, either direction", () => {
    expect(rateDeviationPercent(110, 100)).toBeCloseTo(10);
    expect(rateDeviationPercent(90, 100)).toBeCloseTo(10);
    expect(rateDeviationPercent(100, 100)).toBe(0);
  });

  it("treats an unusable market rate or override as infinitely off", () => {
    expect(rateDeviationPercent(100, 0)).toBe(Infinity);
    expect(rateDeviationPercent(100, -1)).toBe(Infinity);
    expect(rateDeviationPercent(Number.NaN, 100)).toBe(Infinity);
    expect(rateDeviationPercent(100, Number.NaN)).toBe(Infinity);
  });
});

// ---------------------------------------------------------------------------
// currencyConversion.ts
// ---------------------------------------------------------------------------

describe("formatBalanceWithFiat", () => {
  it("shows the token amount and its approximate fiat value", () => {
    expect(formatBalanceWithFiat("10", "XLM", { rates: { XLM: 0.12 } })).toEqual({
      tokenText: "10.00 XLM",
      fiatText: "~$1.20 USD",
      hasFiat: true,
      isLoading: false,
      accessibilityLabel: "10.00 XLM, approximately $1.20 USD",
    });
  });

  it("shows a loading placeholder while the rates are loading", () => {
    expect(formatBalanceWithFiat("10", "XLM", { rates: { XLM: 0.12 }, isLoading: true })).toEqual({
      tokenText: "10.00 XLM",
      fiatText: "…",
      hasFiat: false,
      isLoading: true,
      accessibilityLabel: "10.00 XLM, fiat equivalent loading",
    });
  });

  it("shows only the token when the rate is missing", () => {
    for (const rates of [undefined, null, {}, { USDC: 1 }, { XLM: null }, { XLM: undefined }, { XLM: Number.NaN }]) {
      expect(formatBalanceWithFiat("10", "XLM", { rates })).toMatchObject({
        tokenText: "10.00 XLM",
        fiatText: null,
        hasFiat: false,
        accessibilityLabel: "10.00 XLM",
      });
    }
  });

  it("shows no fiat for an amount it cannot read", () => {
    expect(formatBalanceWithFiat("abc", "XLM", { rates: { XLM: 0.12 } })).toMatchObject({
      tokenText: AMOUNT_UNAVAILABLE,
      fiatText: null,
      hasFiat: false,
    });
    expect(formatBalanceWithFiat(null, "XLM", { rates: { XLM: 0.12 } }).hasFiat).toBe(false);
  });

  it("reads an asset code of any case and number amounts", () => {
    expect(formatBalanceWithFiat(2.5, " xlm ", { rates: { XLM: 0.1 } }).fiatText).toBe("~$0.25 USD");
  });

  it("uses the symbol of the target currency, or its code when it has none", () => {
    expect(formatBalanceWithFiat("2", "XLM", { rates: { XLM: 1.2 }, fiatCurrency: "eur" }).fiatText).toBe(
      "~€2.40 EUR",
    );
    expect(formatBalanceWithFiat("1", "XLM", { rates: { XLM: 1 }, fiatCurrency: "CHF" }).fiatText).toBe(
      "~CHF 1.00 CHF",
    );
    expect(
      formatBalanceWithFiat("1", "XLM", { rates: { XLM: 1 }, fiatSymbol: "US$" }).fiatText,
    ).toBe("~US$1.00 USD");
  });

  it("applies the requested fiat decimals and groups thousands", () => {
    expect(formatBalanceWithFiat("10", "XLM", { rates: { XLM: 0.12 }, fiatDecimals: 4 }).fiatText).toBe(
      "~$1.2000 USD",
    );
    expect(formatBalanceWithFiat("10", "XLM", { rates: { XLM: 0.12 }, fiatDecimals: 0 }).fiatText).toBe(
      "~$1 USD",
    );
    expect(formatBalanceWithFiat("1000000", "XLM", { rates: { XLM: 0.5 } }).fiatText).toBe(
      "~$500,000.00 USD",
    );
  });

  it("converts a negative balance without losing its sign", () => {
    const display = formatBalanceWithFiat("-10", "XLM", { rates: { XLM: 0.12 } });

    expect(display.tokenText).toBe("-10.00 XLM");
    expect(display.hasFiat).toBe(true);
    expect(display.fiatText).toMatch(/-1\.20/);
  });
});

describe("assetExchangeRates", () => {
  it("derives both directions of the XLM/USDC cross rate", () => {
    const rates = assetExchangeRates({ xlm: 0.12, usdc: 1 });

    expect(rates?.rates["XLM-USDC"]).toBeCloseTo(0.12);
    expect(rates?.rates["USDC-XLM"]).toBeCloseTo(1 / 0.12);
  });

  it("defaults to an offline, timestamp-0 snapshot and passes the feed flags through", () => {
    expect(assetExchangeRates({ xlm: 1, usdc: 1 })).toMatchObject({ live: false, timestamp: 0 });
    expect(assetExchangeRates({ xlm: 1, usdc: 1, live: true }, 99)).toMatchObject({ live: true, timestamp: 99 });
  });

  it("returns null for a missing, zero, negative or non-finite price", () => {
    for (const pair of [
      null,
      undefined,
      { xlm: 0, usdc: 1 },
      { xlm: 1, usdc: 0 },
      { xlm: -1, usdc: 1 },
      { xlm: Number.NaN, usdc: 1 },
      { xlm: 1, usdc: Infinity },
      { xlm: "1", usdc: 1 } as unknown as { xlm: number; usdc: number },
    ]) {
      expect(assetExchangeRates(pair)).toBeNull();
    }
  });
});

describe("convertBalanceAmount", () => {
  it("converts between XLM and USDC in both directions", () => {
    expect(convertBalanceAmount("100", "XLM", "USDC", RATES)).toBe("12.0000000");
    expect(convertBalanceAmount("12", "USDC", "XLM", RATES)).toBe("100.0000000");
  });

  it("accepts number amounts and a plain rate map", () => {
    expect(convertBalanceAmount(100, "XLM", "USDC", RATES)).toBe("12.0000000");
    expect(convertBalanceAmount("16", "XLM", "USDC", { "USDC-XLM": 8 })).toBe("2.0000000");
  });

  it("keeps the sign of a negative balance", () => {
    expect(convertBalanceAmount("-100", "XLM", "USDC", RATES)).toBe("-12.0000000");
    expect(convertBalanceAmount("-0.5", "XLM", "XLM", RATES)).toBe("-0.5000000");
  });

  it("returns null when there is nothing honest to show", () => {
    expect(convertBalanceAmount("100", "XLM", "USDC", null)).toBeNull();
    expect(convertBalanceAmount("100", "XLM", "USDC", undefined)).toBeNull();
    expect(convertBalanceAmount("", "XLM", "USDC", RATES)).toBeNull();
    expect(convertBalanceAmount("   ", "XLM", "USDC", RATES)).toBeNull();
    expect(convertBalanceAmount(null, "XLM", "USDC", RATES)).toBeNull();
    expect(convertBalanceAmount("abc", "XLM", "USDC", RATES)).toBeNull();
    expect(convertBalanceAmount("100", "XLM", "AQUA", RATES)).toBeNull();
  });
});

describe("formatAssetEquivalent", () => {
  it("renders the converted amount with the approximation prefix and the target asset", () => {
    expect(formatAssetEquivalent("-100", "XLM", "USDC", RATES)).toBe("≈ -12.00 USDC");
    expect(formatAssetEquivalent("1", "XLM", "USDC", RATES)).toBe("≈ 0.12 USDC");
  });

  it("honours a custom prefix, precision and locale", () => {
    expect(formatAssetEquivalent("100", "XLM", "USDC", RATES, { prefix: "~" })).toBe("~ 12.00 USDC");
    expect(formatAssetEquivalent("10000", "XLM", "USDC", RATES, { locale: "de-DE" })).toBe("≈ 1.200,00 USDC");
    expect(formatAssetEquivalent("1", "XLM", "USDC", RATES, { minDecimals: 4, maxDecimals: 6 })).toBe(
      "≈ 0.1200 USDC",
    );
  });

  it("is null when the conversion is", () => {
    expect(formatAssetEquivalent("100", "XLM", "USDC", null)).toBeNull();
    expect(formatAssetEquivalent("100", "XLM", "AQUA", RATES)).toBeNull();
  });
});

describe("aggregateBalancesInAsset", () => {
  it("adds amounts held in different assets as one figure in the target asset", () => {
    expect(
      aggregateBalancesInAsset(
        [
          { amount: "100", assetCode: "XLM" },
          { amount: "12", assetCode: "USDC" },
        ],
        "USDC",
        RATES,
      ),
    ).toBe("24.0000000");
  });

  it("does not drift over many small amounts", () => {
    const tenths = Array.from({ length: 100 }, () => ({ amount: "0.1", assetCode: "XLM" }));

    expect(aggregateBalancesInAsset(tenths, "XLM", RATES)).toBe("10.0000000");
  });

  it("returns null rather than a plausible-looking partial total", () => {
    const items = [
      { amount: "10", assetCode: "XLM" },
      { amount: "5", assetCode: "AQUA" },
    ];

    expect(aggregateBalancesInAsset(items, "XLM", RATES)).toBeNull();
    expect(aggregateBalancesInAsset([{ amount: null, assetCode: "XLM" }], "XLM", RATES)).toBeNull();
  });

  it("returns null with no rates or no items", () => {
    expect(aggregateBalancesInAsset([{ amount: "1", assetCode: "XLM" }], "XLM", null)).toBeNull();
    expect(aggregateBalancesInAsset([], "XLM", RATES)).toBeNull();
  });

  it("sums a negative whole-number debt", () => {
    expect(aggregateBalancesInAsset([{ amount: "-3", assetCode: "XLM" }], "XLM", RATES)).toBe("-3.0000000");
  });

  it("sums a negative debt with a fractional part", () => {
    expect(aggregateBalancesInAsset([{ amount: "-1.5", assetCode: "XLM" }], "XLM", RATES)).toBe("-1.5000000");
  });

  it("keeps the sign of a negative debt below one unit", () => {
    expect(aggregateBalancesInAsset([{ amount: "-0.5", assetCode: "XLM" }], "XLM", RATES)).toBe("-0.5000000");
  });
});

// ---------------------------------------------------------------------------
// exchange.ts
// ---------------------------------------------------------------------------

describe("getPairKey", () => {
  it("normalises both codes", () => {
    expect(getPairKey(" xlm ", "usdc")).toBe("XLM-USDC");
  });
});

describe("convertAmount", () => {
  it("returns the same asset unchanged, at seven decimals", () => {
    expect(convertAmount("1.5", "XLM", "xlm", {})).toBe("1.5000000");
    expect(convertAmount(2.5, "USDC", "USDC", {})).toBe("2.5000000");
  });

  it("rejects a negative or unreadable amount, even for the same asset", () => {
    expect(convertAmount("-1", "XLM", "XLM", {})).toBeNull();
    expect(convertAmount("abc", "XLM", "XLM", {})).toBeNull();
    expect(convertAmount("-1", "XLM", "USDC", RATES)).toBeNull();
    expect(convertAmount("abc", "XLM", "USDC", RATES)).toBeNull();
  });

  it("prefers the inverse pair and divides", () => {
    expect(convertAmount("16", "XLM", "USDC", { "USDC-XLM": 8 })).toBe("2.0000000");
  });

  it("falls back to the direct pair and multiplies", () => {
    expect(convertAmount("10", "XLM", "USDC", { "XLM-USDC": 0.5 })).toBe("5.0000000");
  });

  it("reads rates from an ExchangeRates object", () => {
    expect(convertAmount("100", "XLM", "USDC", RATES)).toBe("12.0000000");
  });

  it("returns null when no usable rate exists", () => {
    expect(convertAmount("10", "XLM", "USDC", {})).toBeNull();
    expect(convertAmount("10", "XLM", "USDC", { "USDC-XLM": 0 })).toBeNull();
    expect(convertAmount("10", "XLM", "USDC", { "USDC-XLM": -2 })).toBeNull();
    expect(convertAmount("10", "XLM", "USDC", { "USDC-XLM": Number.NaN })).toBeNull();
    expect(convertAmount("10", "XLM", "USDC", { "XLM-USDC": Infinity })).toBeNull();
  });

  it("never rounds a non-zero amount down to nothing", () => {
    expect(convertAmount("0.0000001", "XLM", "USDC", { "XLM-USDC": 0.12 })).toBe("0.0000001");
  });

  it("converts zero to zero", () => {
    expect(convertAmount("0", "XLM", "USDC", RATES)).toBe("0.0000000");
  });
});

describe("aggregateMixedAmounts", () => {
  it("sums everything it can convert into the target asset", () => {
    expect(
      aggregateMixedAmounts(
        [
          { amount: "100", assetCode: "XLM" },
          { amount: "12", assetCode: "USDC" },
        ],
        "USDC",
        RATES,
      ),
    ).toBe("24.0000000");
  });

  it("skips an item it cannot convert instead of failing", () => {
    expect(
      aggregateMixedAmounts(
        [
          { amount: "10", assetCode: "XLM" },
          { amount: "5", assetCode: "AQUA" },
        ],
        "XLM",
        RATES,
      ),
    ).toBe("10.0000000");
  });

  it("is zero for no items", () => {
    expect(aggregateMixedAmounts([], "XLM", RATES)).toBe("0.0000000");
  });
});

// ---------------------------------------------------------------------------
// format.ts / settlementFormatting.ts
// ---------------------------------------------------------------------------

describe("shortKey / shortHash", () => {
  const key = "GABCDEFGHIJKLMNOP";

  it("keeps the ends of a long key", () => {
    expect(shortKey(key)).toBe("GABC…MNOP");
    expect(shortKey(key, 2)).toBe("GA…OP");
  });

  it("leaves a short or empty key alone", () => {
    expect(shortKey("GABCDEFGH")).toBe("GABCDEFGH");
    expect(shortKey("")).toBe("");
  });

  it("shortHash keeps six characters at each end by default", () => {
    expect(shortHash("abcdefghijklmnopqrst")).toBe("abcdef…opqrst");
  });
});

describe("formatAmount / formatMoney / formatCurrencyAmount", () => {
  it("formatAmount formats without an asset and marks missing input", () => {
    expect(formatAmount("1234.5")).toBe("1,234.50");
    expect(formatAmount(null)).toBe(AMOUNT_UNAVAILABLE);
    expect(formatAmount("1.23456", { maxDecimals: 3 })).toBe("1.235");
  });

  it("formatMoney keeps the asset next to the amount", () => {
    expect(formatMoney("1234.5", "usdc")).toBe("1,234.50 USDC");
  });

  it("formatCurrencyAmount formats a valid amount", () => {
    expect(formatCurrencyAmount("0.0000001", "xlm")).toBe("0.0000001 XLM");
  });

  it("formatCurrencyAmount keeps the asset visible when the amount is unreadable", () => {
    expect(formatCurrencyAmount("x", "usdc")).toBe(`${AMOUNT_UNAVAILABLE} USDC`);
    expect(formatCurrencyAmount("x", null)).toBe(AMOUNT_UNAVAILABLE);
  });
});

describe("date wrappers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fall back to a placeholder for a value that is not a date", () => {
    expect(timeAgo("not a date")).toBe("—");
    expect(timeAgo(null)).toBe("—");
    expect(fullDate("not a date")).toBe("—");
    expect(fullDateLabel("not a date")).toBe("Date unavailable");
    expect(fullDateLabel(undefined)).toBe("Date unavailable");
  });

  it("timeAgo is relative to now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T15:04:05Z"));

    expect(timeAgo("2026-07-29T12:04:05Z")).toBe("about 3 hours ago");
  });

  it("fullDate and fullDateLabel name the year of a real date", () => {
    expect(fullDate("2026-07-29")).toMatch(/2026/);
    expect(fullDateLabel("2026-07-29T15:04:05Z")).toMatch(/2026/);
  });
});

describe("initials / avatarColor", () => {
  it("takes at most the first two initials, upper-case", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("single")).toBe("S");
    expect(initials("a b c")).toBe("AB");
    expect(initials("  ")).toBe("");
  });

  it("picks a stable colour from the palette for a given seed", () => {
    expect(avatarColor("GABC")).toBe(avatarColor("GABC"));
    expect(avatarColor("")).toBe("#6C4DF6");
    expect(["#6C4DF6", "#FF8A3C", "#FF5D8F", "#3DD6C3", "#B5DB1F", "#FFE45C"]).toContain(
      avatarColor("GSOMEOTHERKEY"),
    );
  });
});

describe("settlementFormatting.formatCurrency", () => {
  it("formats numbers and numeric strings as currency", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
    expect(formatCurrency("12.3", "EUR")).toBe("€12.30");
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency("-5")).toBe("-$5.00");
  });

  it("returns an empty string for an unreadable amount", () => {
    expect(formatCurrency("abc")).toBe("");
  });
});
