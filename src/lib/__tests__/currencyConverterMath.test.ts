import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { convertAmount, aggregateMixedAmounts, getPairKey, normalizeAssetCode } from "../exchange";

describe("Currency Conversion Math & Precision (#364)", () => {
  const mockRates = {
    "XLM-USDC": 0.12,
    "USDC-XLM": 8.3333333,
    "USD-USDC": 1.0,
    "USDC-USD": 1.0,
    "EUR-USD": 1.09,
    "USD-EUR": 0.9174311,
    "GBP-USD": 1.27,
  };

  it("normalizes asset codes and pair keys", () => {
    assert.equal(normalizeAssetCode("  xlm "), "XLM");
    assert.equal(getPairKey("xlm", "usdc"), "XLM-USDC");
  });

  it("converts identical assets directly without loss", () => {
    assert.equal(convertAmount("100.5000000", "USDC", "USDC", mockRates), "100.5000000");
    assert.equal(convertAmount("50", "XLM", "XLM", mockRates), "50.0000000");
  });

  it("converts cross-asset values using canonical rates", () => {
    const converted = convertAmount("100", "XLM", "USDC", mockRates);
    assert.notEqual(converted, null);
    // 100 * 0.12 = 12 USDC
    assert.ok(Math.abs(parseFloat(converted!) - 12.0) < 0.001);
  });

  it("aggregates mixed asset amounts into a common target asset", () => {
    const items = [
      { amount: "100", assetCode: "XLM" }, // 12 USDC
      { amount: "50", assetCode: "USDC" }, // 50 USDC
    ];

    const totalUsdc = aggregateMixedAmounts(items, "USDC", mockRates);
    assert.ok(Math.abs(parseFloat(totalUsdc) - 62.0) < 0.01);
  });

  it("handles zero, negative, and invalid values gracefully", () => {
    assert.equal(convertAmount("0", "XLM", "USDC", mockRates), "0.0000000");
    assert.equal(convertAmount("-10", "XLM", "USDC", mockRates), null);
    assert.equal(convertAmount("not-a-number", "XLM", "USDC", mockRates), null);
    assert.equal(convertAmount("10", "UNKNOWN", "USDC", mockRates), null);
  });
});
