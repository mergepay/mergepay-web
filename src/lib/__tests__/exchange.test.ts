import { describe, it, expect } from "vitest";
import { convertAmount, aggregateMixedAmounts, normalizeAssetCode, getPairKey } from "../exchange";

describe("Exchange Rate and Currency Conversion Utilities", () => {
  const sampleRates = {
    "XLM-USDC": 0.12,
    "USDC-XLM": 8.3333333,
    "XLM-BTC": 0.0000025,
  };

  it("normalizes asset codes correctly", () => {
    expect(normalizeAssetCode("  xlm ")).toBe("XLM");
    expect(normalizeAssetCode("usdc")).toBe("USDC");
  });

  it("builds standard pair keys", () => {
    expect(getPairKey("xlm", "usdc")).toBe("XLM-USDC");
  });

  it("converts amounts accurately between supported trustlines", () => {
    const converted = convertAmount("100.0000000", "XLM", "USDC", sampleRates);
    expect(converted).toBe("12.0000000");
  });

  it("handles inverse rate lookups automatically", () => {
    const converted = convertAmount("12.0000000", "USDC", "XLM", sampleRates);
    expect(converted).toBe("100.0000000");
  });

  it("returns the same amount when source and target assets match", () => {
    const converted = convertAmount("45.5000000", "USDC", "USDC", sampleRates);
    expect(converted).toBe("45.5000000");
  });

  it("handles zero amounts correctly", () => {
    expect(convertAmount("0", "XLM", "USDC", sampleRates)).toBe("0.0000000");
    expect(convertAmount("0.0000000", "USDC", "XLM", sampleRates)).toBe("0.0000000");
  });

  it("returns null for negative amounts or unparseable inputs", () => {
    expect(convertAmount("-10", "XLM", "USDC", sampleRates)).toBeNull();
    expect(convertAmount("abc", "XLM", "USDC", sampleRates)).toBeNull();
  });

  it("returns null when rate is missing or zero/invalid", () => {
    expect(convertAmount("10", "XLM", "EUR", sampleRates)).toBeNull();
    const zeroRate = { "XLM-USDC": 0 };
    expect(convertAmount("10", "XLM", "USDC", zeroRate)).toBeNull();
  });

  it("aggregates mixed asset amounts into a common target asset", () => {
    const items = [
      { amount: "100.0000000", assetCode: "XLM" },
      { amount: "12.0000000", assetCode: "USDC" },
    ];
    // 100 XLM = 12 USDC. Plus 12 USDC = 24 USDC total.
    const total = aggregateMixedAmounts(items, "USDC", sampleRates);
    expect(total).toBe("24.0000000");
  });

  it("adapts correctly to rate fluctuations", () => {
    const fluctuatingRates = { "XLM-USDC": 0.15 };
    const converted = convertAmount("100.0000000", "XLM", "USDC", fluctuatingRates);
    expect(converted).toBe("15.0000000");
  });
});
