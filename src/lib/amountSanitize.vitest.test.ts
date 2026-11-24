import { describe, expect, it } from "vitest";
import {
  clampDecimalPlaces,
  countDecimalPlaces,
  expandScientificNotation,
  getAssetDecimalPlaces,
  sanitizePastedAmount,
} from "./amountSanitize";
import { isTypableAmount } from "./expenseValidation";

function ok(raw: string, places?: number) {
  const r = sanitizePastedAmount(raw, places);
  if (!r.ok) throw new Error(`expected ${raw} to sanitise, got ${r.reason}`);
  return r.value;
}

function reason(raw: string, places?: number) {
  const r = sanitizePastedAmount(raw, places);
  return r.ok ? null : r.reason;
}

describe("sanitizePastedAmount", () => {
  it("keeps a plain decimal untouched", () => {
    expect(ok("12.5")).toBe("12.5");
    expect(ok("0")).toBe("0");
    expect(ok("0.0000001")).toBe("0.0000001");
  });

  it("strips currency symbols, asset codes and whitespace", () => {
    expect(ok("$12.50")).toBe("12.50");
    expect(ok("€ 9")).toBe("9");
    expect(ok("12.5 USDC")).toBe("12.5");
    expect(ok("XLM 100")).toBe("100");
    expect(ok(" 42 ")).toBe("42");
  });

  it("removes grouping separators", () => {
    expect(ok("1,234")).toBe("1234");
    expect(ok("1,234,567.89")).toBe("1234567.89");
    expect(ok("1.234,56")).toBe("1234.56");
    expect(ok("1 234,56")).toBe("1234.56");
    expect(ok("1.234.567")).toBe("1234567");
  });

  it("treats a lone comma as the decimal mark", () => {
    expect(ok("12,5")).toBe("12.5");
  });

  it("expands scientific notation without float drift", () => {
    expect(ok("1e5")).toBe("100000");
    expect(ok("1.5E-3")).toBe("0.0015");
    expect(ok("1e-7")).toBe("0.0000001");
    expect(ok("+2e2")).toBe("200");
  });

  it("refuses negatives instead of flipping the sign", () => {
    expect(reason("-5")).toBe("negative");
    expect(reason("−5")).toBe("negative");
    expect(reason("(5.00)")).toBe("negative");
    expect(reason("-1e3")).toBe("negative");
  });

  it("refuses NaN, Infinity and malformed strings", () => {
    expect(reason("NaN")).toBe("not_a_number");
    expect(reason("Infinity")).toBe("not_a_number");
    expect(reason("abc")).toBe("not_a_number");
    expect(reason("1.2.3")).toBe("not_a_number");
    expect(reason("12,34,5")).toBe("not_a_number");
    expect(reason("0x1F")).toBe("not_a_number");
  });

  it("refuses empty input", () => {
    expect(reason("   ")).toBe("empty");
  });

  it("refuses precision beyond the asset limit rather than rounding", () => {
    expect(reason("1.12345678")).toBe("too_precise");
    expect(reason("1e-8")).toBe("too_precise");
    expect(reason("1.234", 2)).toBe("too_precise");
    expect(reason("1.5", 0)).toBe("too_precise");
  });

  it("drops trailing zeros that only exceed the limit cosmetically", () => {
    expect(ok("1.50000000")).toBe("1.5");
    expect(ok("2.000", 0)).toBe("2");
  });
});

describe("expandScientificNotation", () => {
  it("returns null for non-scientific input", () => {
    expect(expandScientificNotation("12.5")).toBeNull();
    expect(expandScientificNotation("e5")).toBeNull();
  });

  it("handles large and small exponents", () => {
    expect(expandScientificNotation("1.23e10")).toBe("12300000000");
    expect(expandScientificNotation("123e-5")).toBe("0.00123");
    expect(expandScientificNotation("0.000e3")).toBe("0");
  });
});

describe("asset precision", () => {
  it("defaults XLM, USDC and unknown tokens to Stellar's 7 decimals", () => {
    expect(getAssetDecimalPlaces("XLM")).toBe(7);
    expect(getAssetDecimalPlaces("usdc")).toBe(7);
    expect(getAssetDecimalPlaces("SOMETOKEN")).toBe(7);
    expect(getAssetDecimalPlaces(undefined)).toBe(7);
  });

  it("honours an explicit override, clamped to 0–7", () => {
    expect(getAssetDecimalPlaces("TOKEN", 2)).toBe(2);
    expect(getAssetDecimalPlaces("TOKEN", 12)).toBe(7);
    expect(getAssetDecimalPlaces("TOKEN", -1)).toBe(0);
    expect(clampDecimalPlaces(Number.NaN)).toBe(7);
  });

  it("counts decimal places", () => {
    expect(countDecimalPlaces("12")).toBe(0);
    expect(countDecimalPlaces("12.50")).toBe(2);
  });
});

describe("isTypableAmount with asset precision", () => {
  it("keeps the 7-decimal default", () => {
    expect(isTypableAmount("1.1234567")).toBe(true);
    expect(isTypableAmount("1.12345678")).toBe(false);
  });

  it("narrows to the asset's decimals", () => {
    expect(isTypableAmount("1.23", 2)).toBe(true);
    expect(isTypableAmount("1.234", 2)).toBe(false);
    expect(isTypableAmount("12", 0)).toBe(true);
    expect(isTypableAmount("12.", 0)).toBe(false);
  });

  it("still refuses signs and exponents", () => {
    for (const v of ["-1", "1e5", "+1", "1,0"]) expect(isTypableAmount(v, 2)).toBe(false);
  });
});
