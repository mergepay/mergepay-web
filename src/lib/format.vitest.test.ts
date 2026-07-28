import { describe, expect, it } from "vitest";
import { formatAmount, formatMoney, shortHash, shortKey } from "./format";

describe("format helpers", () => {
  it("formats zero and trims ordinary trailing zeros", () => {
    expect(formatAmount("0")).toBe("0");
    expect(formatAmount("12.3400")).toBe("12.34");
    expect(formatAmount("1234567.89")).toBe("1,234,567.89");
  });

  it("preserves up to seven decimals for sub-cent values", () => {
    expect(formatAmount("0.001234500")).toBe("0.0012345");
    expect(formatAmount("0.00000001")).toBe("0");
  });

  it("formats negative values and asset labels", () => {
    expect(formatAmount("-42.500")).toBe("-42.5");
    expect(formatMoney("10.00", "XLM")).toBe("10 XLM");
  });

  it("truncates keys and hashes only when they exceed the boundary", () => {
    expect(shortKey("ABCDEFG", 3)).toBe("ABCDEFG");
    expect(shortKey("ABCDEFGH", 3)).toBe("ABC…FGH");
    expect(shortHash("123456789012", 4)).toBe("1234…9012");
  });
});
