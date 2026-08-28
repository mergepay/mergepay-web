import { describe, expect, it } from "vitest";
import { formatAmount, formatMoney, shortHash, shortKey } from "./format";

describe("format helpers", () => {
  it("pads to a two-decimal minimum and trims extra trailing zeros", () => {
    // currency.ts renders a fixed two-decimal minimum so equivalent amounts
    // line up in a column; only zeros beyond that minimum are trimmed.
    expect(formatAmount("0")).toBe("0.00");
    expect(formatAmount("12.3400")).toBe("12.34");
    expect(formatAmount("1234567.89")).toBe("1,234,567.89");
  });

  it("keeps up to seven decimals but rounds sub-stroop values to zero", () => {
    expect(formatAmount("0.001234500")).toBe("0.0012345");
    expect(formatAmount("0.0000001")).toBe("0.0000001"); // exactly one stroop
    expect(formatAmount("0.00000001")).toBe("0.00"); // below one stroop → 0
  });

  it("formats negative values and asset labels", () => {
    expect(formatAmount("-42.500")).toBe("-42.50");
    expect(formatMoney("10.00", "XLM")).toBe("10.00 XLM");
  });

  it("truncates keys and hashes only when they exceed the boundary", () => {
    expect(shortKey("ABCDEFG", 3)).toBe("ABCDEFG");
    expect(shortKey("ABCDEFGH", 3)).toBe("ABC…FGH");
    expect(shortHash("123456789012", 4)).toBe("1234…9012");
  });
});
