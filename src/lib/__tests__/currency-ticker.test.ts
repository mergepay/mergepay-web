import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatTickerConversion,
  formatTickerRate,
  parseTickerRates,
  tickerRateKey,
} from "../currency-ticker";

describe("multi-currency exchange ticker (#848)", () => {
  it("parses supported fiat rates and skips invalid entries", () => {
    const rates = parseTickerRates({
      stellar: { usd: 0.25, eur: 0.23, gbp: -1, cad: 0.34 },
      "usd-coin": { usd: 1, eur: 0.92, gbp: 0.8, cad: "bad" },
    });
    assert.equal(rates[tickerRateKey("XLM", "USD")], 0.25);
    assert.equal(rates[tickerRateKey("USDC", "EUR")], 0.92);
    assert.equal(rates[tickerRateKey("XLM", "GBP")], undefined);
    assert.equal(rates[tickerRateKey("USDC", "CAD")], undefined);
  });

  it("rejects missing or unusable provider data", () => {
    assert.throws(() => parseTickerRates(null));
    assert.throws(() => parseTickerRates({ stellar: {}, "usd-coin": {} }));
    assert.throws(() => parseTickerRates({ stellar: { usd: 1 } }));
  });

  it("formats rates and conversions without fabricated fallback prices", () => {
    assert.equal(formatTickerRate(undefined, "USD"), "Unavailable");
    assert.equal(formatTickerRate(NaN, "EUR"), "Unavailable");
    assert.match(formatTickerRate(0.25, "USD"), /0\.25/);
    assert.equal(formatTickerConversion("10", 0.25, "USD"), "$2.50");
    assert.equal(formatTickerConversion("10", undefined, "USD"), null);
    assert.equal(formatTickerConversion("bad", 0.25, "USD"), null);
    assert.equal(formatTickerConversion("-2", 0.25, "USD"), null);
  });
});
