import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AMOUNT_MAX_DECIMALS,
  AMOUNT_MIN_DECIMALS,
  AMOUNT_UNAVAILABLE,
  AMOUNT_UNAVAILABLE_LABEL,
  DEFAULT_AMOUNT_LOCALE,
  SUPPORTED_FIAT_CURRENCIES,
  UNKNOWN_ASSET_LABEL,
  amountToStroops,
  convertCurrency,
  currencyRate,
  formatAssetAmount,
  formatAssetAmountText,
  normalizeAssetCode,
  parseDecimalDigits,
  rateDeviationPercent,
} from "../currency";

describe("formatAssetAmount — asset labelling (#110)", () => {
  it("appends the asset code to XLM amounts", () => {
    assert.equal(formatAssetAmount("12.5", "XLM").text, "12.50 XLM");
  });

  it("appends the asset code to USDC amounts", () => {
    assert.equal(formatAssetAmount("12.5", "USDC").text, "12.50 USDC");
  });

  it("normalises the asset code casing and whitespace", () => {
    assert.equal(formatAssetAmount("1", " usdc ").text, "1.00 USDC");
    assert.equal(normalizeAssetCode("  xlm "), "XLM");
    assert.equal(normalizeAssetCode("   "), null);
    assert.equal(normalizeAssetCode(undefined), null);
  });

  it("announces both the amount and the asset to screen readers", () => {
    assert.equal(formatAssetAmount("1234.5", "USDC").label, "1,234.50 USDC");
  });

  it("tells screen readers when the data carried no asset code", () => {
    const formatted = formatAssetAmount("1", null);
    assert.equal(formatted.text, "1.00");
    assert.equal(formatted.label, `1.00 ${UNKNOWN_ASSET_LABEL}`);
    assert.equal(formatted.asset, null);
  });

  it("stays silent about the asset when none was expected", () => {
    // `assetCode` omitted entirely — a deliberately asset-less figure.
    const formatted = formatAssetAmount("1");
    assert.equal(formatted.text, "1.00");
    assert.equal(formatted.label, "1.00");
  });
});

describe("formatAssetAmount — precision (#110)", () => {
  it("renders equivalent values identically", () => {
    const expected = "1.50 XLM";
    for (const value of ["1.5", "1.50", "1.5000000", 1.5, "+1.5"]) {
      assert.equal(formatAssetAmount(value, "XLM").text, expected, String(value));
    }
  });

  it("pads to two decimals so columns line up", () => {
    assert.equal(formatAssetAmount("7", "USDC").text, "7.00 USDC");
    assert.equal(formatAssetAmount("7.1", "USDC").text, "7.10 USDC");
  });

  it("keeps sub-cent values instead of rounding them away", () => {
    assert.equal(formatAssetAmount("0.0000001", "XLM").text, "0.0000001 XLM");
    assert.equal(formatAssetAmount("0.005", "USDC").text, "0.005 USDC");
  });

  it("rounds beyond stroop precision, half away from zero", () => {
    assert.equal(formatAssetAmount("1.23456785", "XLM").text, "1.2345679 XLM");
    assert.equal(formatAssetAmount("1.23456784", "XLM").text, "1.2345678 XLM");
    assert.equal(formatAssetAmount("-1.23456785", "XLM").text, "-1.2345679 XLM");
  });

  it("carries the rounding into the integer part", () => {
    assert.equal(formatAssetAmount("9.99999995", "XLM").text, "10.00 XLM");
  });

  it("never shows a negative zero", () => {
    assert.equal(formatAssetAmount("-0", "XLM").text, "0.00 XLM");
    assert.equal(formatAssetAmount("-0.00000001", "XLM").text, "0.00 XLM");
  });

  it("does not introduce floating-point artifacts", () => {
    // 0.1 + 0.2 as a decimal string must survive untouched.
    assert.equal(formatAssetAmount("0.30000000", "XLM").text, "0.30 XLM");
    assert.equal(formatAssetAmount(0.1 + 0.2, "XLM").text, "0.30 XLM");
  });

  it("honours explicit decimal overrides, capped at stroop precision", () => {
    assert.equal(
      formatAssetAmount("1.239", "USDC", { maxDecimals: 2 }).text,
      "1.24 USDC"
    );
    assert.equal(
      formatAssetAmount("1.5", "USDC", { minDecimals: 0 }).text,
      "1.5 USDC"
    );
    assert.equal(
      formatAssetAmount("1.23456789", "XLM", { maxDecimals: 99 }).text,
      "1.2345679 XLM"
    );
  });
});

describe("formatAssetAmount — decimal precision and rounding edge cases (#332)", () => {
  it("handles sub-stroop half-away-from-zero rounding threshold at 8th decimal place", () => {
    // Positive values
    assert.equal(formatAssetAmount("0.00000005", "XLM").text, "0.0000001 XLM");
    assert.equal(formatAssetAmount("0.00000004", "XLM").text, "0.00 XLM");
    assert.equal(formatAssetAmount("1.00000005", "USDC").text, "1.0000001 USDC");
    assert.equal(formatAssetAmount("1.00000004", "USDC").text, "1.00 USDC");

    // Negative values
    assert.equal(formatAssetAmount("-0.00000005", "XLM").text, "-0.0000001 XLM");
    assert.equal(formatAssetAmount("-0.00000004", "XLM").text, "0.00 XLM");
    assert.equal(formatAssetAmount("-1.00000005", "USDC").text, "-1.0000001 USDC");
    assert.equal(formatAssetAmount("-1.00000004", "USDC").text, "-1.00 USDC");
  });

  it("carries rounding through multiple nines into large integers", () => {
    assert.equal(formatAssetAmount("0.99999996", "XLM").text, "1.00 XLM");
    assert.equal(formatAssetAmount("999999.99999995", "XLM").text, "1,000,000.00 XLM");
    assert.equal(formatAssetAmount("-0.99999996", "XLM").text, "-1.00 XLM");
  });

  it("preserves exact decimals up to 7 places and trims redundant trailing zeros", () => {
    assert.equal(formatAssetAmount("1.5000000", "XLM").text, "1.50 XLM");
    assert.equal(formatAssetAmount("1.5010000", "XLM").text, "1.501 XLM");
    assert.equal(formatAssetAmount("1.1234567", "XLM").text, "1.1234567 XLM");
  });

  it("handles minDecimals and maxDecimals boundary constraints safely", () => {
    // maxDecimals = 0 rounds to whole integer
    assert.equal(formatAssetAmount("5.6", "XLM", { maxDecimals: 0 }).text, "6 XLM");
    assert.equal(formatAssetAmount("5.4", "XLM", { maxDecimals: 0 }).text, "5 XLM");
    assert.equal(formatAssetAmount("5.0", "XLM", { minDecimals: 0, maxDecimals: 0 }).text, "5 XLM");

    // minDecimals higher than maxDecimals is clamped to maxDecimals
    assert.equal(
      formatAssetAmount("1.234", "USDC", { minDecimals: 5, maxDecimals: 2 }).text,
      "1.23 USDC"
    );

    // Negative decimal settings clamped to 0
    assert.equal(
      formatAssetAmount("1.23", "USDC", { minDecimals: -2, maxDecimals: -1 }).text,
      "1 USDC"
    );

    // Non-finite decimal settings fallback safely
    assert.equal(
      formatAssetAmount("1.5", "USDC", { maxDecimals: Infinity }).text,
      "1.50 USDC"
    );
    assert.equal(
      formatAssetAmount("1.5", "USDC", { minDecimals: NaN }).text,
      "1.5000000 USDC"
    );
  });
});

describe("formatAssetAmount — magnitude and sign (#110)", () => {
  it("groups large integer parts", () => {
    assert.equal(
      formatAssetAmount("1234567.891", "USDC").text,
      "1,234,567.891 USDC"
    );
  });

  it("handles values far beyond double precision exactly", () => {
    assert.equal(
      formatAssetAmount("922337203685477.5808", "XLM").text,
      "922,337,203,685,477.5808 XLM"
    );
  });

  it("handles very large values (quintillions) without losing digit integrity", () => {
    assert.equal(
      formatAssetAmount("1000000000000000000", "USDC").text,
      "1,000,000,000,000,000,000.00 USDC"
    );
    assert.equal(
      formatAssetAmount("999999999999999.9999999", "XLM").text,
      "999,999,999,999,999.9999999 XLM"
    );
  });

  it("strips leading zeros from integer parts correctly", () => {
    assert.equal(formatAssetAmount("0001234.56", "XLM").text, "1,234.56 XLM");
    assert.equal(formatAssetAmount("-00042.50", "XLM").text, "-42.50 XLM");
    assert.equal(formatAssetAmount("000", "XLM").text, "0.00 XLM");
  });

  it("renders zero as a real value, not a fallback", () => {
    const zero = formatAssetAmount("0", "USDC");
    assert.equal(zero.text, "0.00 USDC");
    assert.equal(zero.valid, true);
  });

  it("handles all signed and unsigned zero representations identically", () => {
    for (const val of ["0", "0.0", "0.0000", "+0", "+0.00", "-0", "-0.0", "-0.0000"]) {
      assert.equal(formatAssetAmount(val, "XLM").text, "0.00 XLM", `Failed for ${val}`);
    }
  });

  it("formats negative amounts with proper signs and grouping", () => {
    assert.equal(formatAssetAmount("-1234567.89", "USDC").text, "-1,234,567.89 USDC");
    assert.equal(formatAssetAmount("-0.0000001", "XLM").text, "-0.0000001 XLM");
  });

  it("prefixes a sign only when asked, and never on zero", () => {
    assert.equal(
      formatAssetAmount("5", "XLM", { signDisplay: "always" }).text,
      "+5.00 XLM"
    );
    assert.equal(
      formatAssetAmount("0", "XLM", { signDisplay: "always" }).text,
      "0.00 XLM"
    );
    assert.equal(
      formatAssetAmount("-0", "XLM", { signDisplay: "always" }).text,
      "0.00 XLM"
    );
    assert.equal(
      formatAssetAmount("-5", "XLM", { signDisplay: "always" }).text,
      "-5.00 XLM"
    );
    assert.equal(
      formatAssetAmount("1234.5", "XLM", { signDisplay: "always" }).text,
      "+1,234.50 XLM"
    );
  });

  it("reads exponential notation from string and number inputs", () => {
    assert.equal(formatAssetAmount(1e-7, "XLM").text, "0.0000001 XLM");
    assert.equal(formatAssetAmount("1E+3", "XLM").text, "1,000.00 XLM");
    assert.equal(formatAssetAmount("1.25e+2", "XLM").text, "125.00 XLM");
    assert.equal(formatAssetAmount("1e+6", "XLM").text, "1,000,000.00 XLM");
    assert.equal(formatAssetAmount("1.25e-4", "XLM").text, "0.000125 XLM");
    assert.equal(formatAssetAmount("2.5e-8", "XLM").text, "0.00 XLM");
    assert.equal(formatAssetAmount("-1.5e-3", "XLM").text, "-0.0015 XLM");
    assert.equal(formatAssetAmount("-2.5e+3", "XLM").text, "-2,500.00 XLM");
  });

  it("localises separators without changing the digits", () => {
    assert.equal(
      formatAssetAmount("1234.5", "USDC", { locale: "de-DE" }).text,
      "1.234,50 USDC"
    );
    assert.equal(
      formatAssetAmount("1234567.89", "XLM", { locale: "fr-FR" }).text,
      "1\u202f234\u202f567,89 XLM"
    );
  });
});

describe("formatAssetAmount — invalid input (#110)", () => {
  const invalid = [
    undefined,
    null,
    "",
    "   ",
    "abc",
    "1.2.3",
    "NaN",
    NaN,
    Infinity,
    "-",
    ".",
    "1e",
    "e5",
    "1e+",
    "1e-abc",
  ];

  for (const value of invalid) {
    it(`falls back rather than fabricating a zero for ${JSON.stringify(value)}`, () => {
      const formatted = formatAssetAmount(value as never, "XLM");
      assert.equal(formatted.valid, false);
      assert.equal(formatted.text, AMOUNT_UNAVAILABLE);
      assert.equal(formatted.label, `${AMOUNT_UNAVAILABLE_LABEL} (XLM)`);
    });
  }

  it("still names the failure when the asset is unknown too", () => {
    assert.equal(
      formatAssetAmount("abc", null).label,
      AMOUNT_UNAVAILABLE_LABEL
    );
  });

  it("exposes the same fallback through the text helper", () => {
    assert.equal(formatAssetAmountText("abc", "XLM"), AMOUNT_UNAVAILABLE);
  });
});

describe("formatAssetAmount — raw values are untouched (#110)", () => {
  it("does not mutate the input string", () => {
    const raw = "42.5000000";
    formatAssetAmount(raw, "USDC");
    assert.equal(raw, "42.5000000");
  });

  it("leaves the caller free to send the original value to the API", () => {
    const payload = { amount: "42.5000000", assetCode: "USDC" };
    const display = formatAssetAmount(payload.amount, payload.assetCode);
    assert.equal(display.text, "42.50 USDC");
    assert.deepEqual(payload, { amount: "42.5000000", assetCode: "USDC" });
  });
});

describe("parseDecimalDigits (#110, #332)", () => {
  it("splits a decimal string into exact digits", () => {
    assert.deepEqual(parseDecimalDigits("-12.340"), {
      negative: true,
      int: "12",
      frac: "340",
    });
  });

  it("accepts values with no integer or no fractional part", () => {
    assert.deepEqual(parseDecimalDigits(".5"), {
      negative: false,
      int: "0",
      frac: "5",
    });
    assert.deepEqual(parseDecimalDigits("5."), {
      negative: false,
      int: "5",
      frac: "",
    });
  });

  it("handles exponential forms in parseDecimalDigits", () => {
    assert.deepEqual(parseDecimalDigits("+1.5e2"), {
      negative: false,
      int: "150",
      frac: "",
    });
    assert.deepEqual(parseDecimalDigits("-1.25e-2"), {
      negative: true,
      int: "0",
      frac: "0125",
    });
  });

  it("preserves leading zeros in integer part", () => {
    assert.deepEqual(parseDecimalDigits("007.89"), {
      negative: false,
      int: "007",
      frac: "89",
    });
  });

  it("rejects anything that is not a number", () => {
    assert.equal(parseDecimalDigits("1,000"), null);
    assert.equal(parseDecimalDigits("1e"), null);
    assert.equal(parseDecimalDigits("e5"), null);
    assert.equal(parseDecimalDigits("1e+"), null);
    assert.equal(parseDecimalDigits("1e-abc"), null);
    assert.equal(parseDecimalDigits({} as never), null);
  });
});

describe("amountToStroops (#110, #332)", () => {
  it("converts to exact signed stroops", () => {
    assert.equal(amountToStroops("1.5"), 15_000_000n);
    assert.equal(amountToStroops("-0.0000001"), -1n);
    assert.equal(amountToStroops("0"), 0n);
  });

  it("handles sub-stroop half-away-from-zero rounding", () => {
    assert.equal(amountToStroops("0.00000005"), 1n);
    assert.equal(amountToStroops("0.00000004"), 0n);
    assert.equal(amountToStroops("-0.00000005"), -1n);
    assert.equal(amountToStroops("-0.00000004"), 0n);
  });

  it("handles very large values without precision loss", () => {
    assert.equal(amountToStroops("922337203685477.5807"), 9223372036854775807000n);
  });

  it("converts exponential notation to stroops", () => {
    assert.equal(amountToStroops("1.5e-3"), 15000n);
    assert.equal(amountToStroops("-2e-7"), -2n);
  });

  it("sums without floating-point drift", () => {
    const values = ["0.1", "0.2", "0.3", "0.4"];
    const total = values.reduce((sum, v) => sum + (amountToStroops(v) ?? 0n), 0n);
    assert.equal(total, 10_000_000n);
  });

  it("returns null for unreadable amounts", () => {
    assert.equal(amountToStroops("abc"), null);
    assert.equal(amountToStroops(undefined), null);
    assert.equal(amountToStroops("1.2.3"), null);
  });
});

describe("currencyRate, convertCurrency, and rateDeviationPercent (#332)", () => {
  it("provides fallback rates for all supported fiat currencies", () => {
    for (const curr of SUPPORTED_FIAT_CURRENCIES) {
      const rate = currencyRate(curr);
      assert.ok(typeof rate === "number" && rate > 0, `Expected valid rate for ${curr}`);
    }
  });

  it("converts currency with default or custom rates", () => {
    assert.equal(convertCurrency("100", "USD"), "100");
    assert.equal(convertCurrency("50.5", "EUR", 1.1), "55.55");
    assert.equal(convertCurrency("0", "USD"), "0");
    assert.equal(convertCurrency(0, "USD"), "0");
    assert.equal(convertCurrency("0.0000001", "USD", 1), "0.0000001");
  });

  it("returns null for invalid inputs in convertCurrency", () => {
    assert.equal(convertCurrency("-10", "USD"), null);
    assert.equal(convertCurrency("abc", "USD"), null);
    assert.equal(convertCurrency("10", "USD", 0), null);
    assert.equal(convertCurrency("10", "USD", -1), null);
    assert.equal(convertCurrency("10", "USD", NaN), null);
  });

  it("calculates rate deviation percentage correctly", () => {
    assert.equal(rateDeviationPercent(1.0, 1.0), 0);
    assert.equal(rateDeviationPercent(1.5, 1.0), 50);
    assert.ok(Math.abs(rateDeviationPercent(1.1, 1.0) - 10) < 1e-10);
    assert.ok(Math.abs(rateDeviationPercent(0.9, 1.0) - 10) < 1e-10);
    assert.equal(rateDeviationPercent(1.0, 0), Infinity);
    assert.equal(rateDeviationPercent(1.0, -1), Infinity);
    assert.equal(rateDeviationPercent(NaN, 1.0), Infinity);
  });
});

