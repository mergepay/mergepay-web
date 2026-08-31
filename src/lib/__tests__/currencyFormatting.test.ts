import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatCurrencyAmount, formatMoney } from "../format";

describe("Localized Currency Formatting and Asset Precision (#XLM_USDC)", () => {
  it("handles zero amounts correctly without fabrication", () => {
    assert.equal(formatCurrencyAmount("0", "XLM"), "0.00 XLM");
    assert.equal(formatCurrencyAmount("0.0000000", "USDC"), "0.00 USDC");
  });

  it("handles fractional precision and Stellar 7-decimal standard", () => {
    assert.equal(formatCurrencyAmount("1.5000000", "XLM"), "1.50 XLM");
    assert.equal(formatCurrencyAmount("0.0000001", "USDC"), "0.0000001 USDC");
  });

  it("handles large numbers with grouping separators correctly", () => {
    assert.equal(formatCurrencyAmount("1234567.8901234", "USDC"), "1,234,567.8901234 USDC");
    assert.equal(formatMoney("999999999.50", "XLM"), "999,999,999.50 XLM");
  });

  it("handles null or invalid amounts safely", () => {
    assert.equal(formatCurrencyAmount(null, "XLM"), "— XLM");
    assert.equal(formatCurrencyAmount(undefined, "USDC"), "— USDC");
  });
});
