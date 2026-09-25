import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatBalanceWithFiat } from "../currencyConversion";

describe("formatBalanceWithFiat — currency conversion and display helper", () => {
  const rates = {
    XLM: 0.12,
    USDC: 1.0,
  };

  it("formats XLM balances with correct Stellar 7-decimal asset precision and fiat equivalent", () => {
    const result = formatBalanceWithFiat("100.0000000", "XLM", { rates, fiatCurrency: "USD" });
    assert.equal(result.tokenText, "100.00 XLM");
    assert.equal(result.fiatText, "~$12.00 USD");
    assert.equal(result.hasFiat, true);
    assert.equal(result.isLoading, false);
    assert.ok(result.accessibilityLabel.includes("100.00 XLM"));
  });

  it("formats USDC balances with correct fiat equivalent", () => {
    const result = formatBalanceWithFiat("50.50", "USDC", { rates, fiatCurrency: "EUR", fiatSymbol: "€" });
    assert.equal(result.tokenText, "50.50 USDC");
    assert.equal(result.fiatText, "~€50.50 EUR");
    assert.equal(result.hasFiat, true);
  });

  it("gracefully handles loading state without layout shifts or fabricated fiat amounts", () => {
    const result = formatBalanceWithFiat("25.00", "XLM", { rates, isLoading: true });
    assert.equal(result.tokenText, "25.00 XLM");
    assert.equal(result.fiatText, "…");
    assert.equal(result.hasFiat, false);
    assert.equal(result.isLoading, true);
  });

  it("gracefully handles missing exchange rate data", () => {
    const result = formatBalanceWithFiat("10.00", "UNKNOWN", { rates });
    assert.equal(result.tokenText, "10.00 UNKNOWN");
    assert.equal(result.fiatText, null);
    assert.equal(result.hasFiat, false);
    assert.equal(result.isLoading, false);
  });

  it("handles null or invalid amounts without throwing", () => {
    const result = formatBalanceWithFiat(null, "XLM", { rates });
    assert.equal(result.hasFiat, false);
    assert.equal(result.tokenText, "—");
  });
});
