import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AMOUNT_UNAVAILABLE,
  AMOUNT_UNAVAILABLE_LABEL,
  UNKNOWN_ASSET_LABEL,
  amountToStroops,
  formatAssetAmount,
  formatAssetAmountText,
  normalizeAssetCode,
  parseDecimalDigits,
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

  it("renders zero as a real value, not a fallback", () => {
    const zero = formatAssetAmount("0", "USDC");
    assert.equal(zero.text, "0.00 USDC");
    assert.equal(zero.valid, true);
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
      formatAssetAmount("-5", "XLM", { signDisplay: "always" }).text,
      "-5.00 XLM"
    );
  });

  it("reads exponential notation from number inputs", () => {
    assert.equal(formatAssetAmount(1e-7, "XLM").text, "0.0000001 XLM");
    assert.equal(formatAssetAmount("1E+3", "XLM").text, "1,000.00 XLM");
  });

  it("localises separators without changing the digits", () => {
    assert.equal(
      formatAssetAmount("1234.5", "USDC", { locale: "de-DE" }).text,
      "1.234,50 USDC"
    );
  });
});

describe("formatAssetAmount — invalid input (#110)", () => {
  const invalid = [undefined, null, "", "   ", "abc", "1.2.3", "NaN", NaN, Infinity, "-", "."];

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

describe("parseDecimalDigits (#110)", () => {
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

  it("rejects anything that is not a number", () => {
    assert.equal(parseDecimalDigits("1,000"), null);
    assert.equal(parseDecimalDigits("1e"), null);
    assert.equal(parseDecimalDigits({} as never), null);
  });
});

describe("amountToStroops (#110)", () => {
  it("converts to exact signed stroops", () => {
    assert.equal(amountToStroops("1.5"), 15_000_000n);
    assert.equal(amountToStroops("-0.0000001"), -1n);
    assert.equal(amountToStroops("0"), 0n);
  });

  it("sums without floating-point drift", () => {
    const values = ["0.1", "0.2", "0.3", "0.4"];
    const total = values.reduce((sum, v) => sum + (amountToStroops(v) ?? 0n), 0n);
    assert.equal(total, 10_000_000n);
  });

  it("returns null for unreadable amounts", () => {
    assert.equal(amountToStroops("abc"), null);
    assert.equal(amountToStroops(undefined), null);
  });
});
