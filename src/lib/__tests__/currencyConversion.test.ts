import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatBalanceWithFiat,
  assetExchangeRates,
  convertBalanceAmount,
  aggregateBalancesInAsset,
  formatAssetEquivalent,
} from "../currencyConversion";

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

describe("assetExchangeRates — cross-rate from the fiat pair", () => {
  it("derives both pair directions from the fiat prices", () => {
    const rates = assetExchangeRates({ xlm: 0.12, usdc: 1.0, live: true });
    assert.ok(rates);
    assert.equal(rates.rates["XLM-USDC"], 0.12);
    assert.equal(rates.rates["USDC-XLM"], 1 / 0.12);
    assert.equal(rates.live, true);
  });

  it("refuses a rate that cannot be divided", () => {
    assert.equal(assetExchangeRates({ xlm: 0, usdc: 1 }), null);
    assert.equal(assetExchangeRates({ xlm: -0.12, usdc: 1 }), null);
    assert.equal(assetExchangeRates({ xlm: Number.NaN, usdc: 1 }), null);
    assert.equal(assetExchangeRates({ xlm: Number.POSITIVE_INFINITY, usdc: 1 }), null);
    assert.equal(assetExchangeRates(undefined), null);
  });
});

describe("convertBalanceAmount — asset to asset, sign preserved", () => {
  const rates = assetExchangeRates({ xlm: 0.5, usdc: 1 })!;

  it("converts a positive balance into the other asset", () => {
    assert.equal(convertBalanceAmount("100.0000000", "XLM", "USDC", rates), "50.0000000");
    assert.equal(convertBalanceAmount("50", "USDC", "XLM", rates), "100.0000000");
  });

  it("converts a negative net position, which convertAmount alone rejects", () => {
    assert.equal(convertBalanceAmount("-100.0000000", "XLM", "USDC", rates), "-50.0000000");
  });

  it("keeps a zero at zero rather than underflowing it to a stroop", () => {
    assert.equal(convertBalanceAmount("0", "XLM", "USDC", rates), "0.0000000");
    assert.equal(convertBalanceAmount("-0.0000000", "XLM", "USDC", rates), "0.0000000");
  });

  it("rounds a very small fraction up to one stroop instead of to nothing", () => {
    // The sum of a non-zero balance and a zero rate reads as free money, so the
    // helper's floor is the smallest unit the network has.
    assert.equal(convertBalanceAmount("0.0000001", "XLM", "USDC", rates), "0.0000001");
  });

  it("holds integer precision on an amount far beyond float safety", () => {
    const big = convertBalanceAmount("1000000000000", "XLM", "USDC", rates);
    assert.equal(big, "500000000000.0000000");
  });

  it("returns null for an asset, rate or amount it cannot read", () => {
    assert.equal(convertBalanceAmount("10", "BTC", "USDC", rates), null);
    assert.equal(convertBalanceAmount("", "XLM", "USDC", rates), null);
    assert.equal(convertBalanceAmount(null, "XLM", "USDC", rates), null);
    assert.equal(convertBalanceAmount("abc", "XLM", "USDC", rates), null);
  });
});

describe("aggregateBalancesInAsset — one total across mixed assets", () => {
  const rates = assetExchangeRates({ xlm: 0.5, usdc: 1 })!;

  it("sums signed legs of two assets into the target", () => {
    const total = aggregateBalancesInAsset(
      [
        { amount: "100.0000000", assetCode: "XLM" },
        { amount: "-50.0000000", assetCode: "USDC" },
      ],
      "USDC",
      rates
    );
    assert.equal(total, "0.0000000");
  });

  it("accumulates in integer stroops so many rows cannot drift the last decimal", () => {
    const tenths = Array.from({ length: 10 }, () => ({ amount: "0.1", assetCode: "USDC" }));
    assert.equal(aggregateBalancesInAsset(tenths, "USDC", rates), "1.0000000");
  });

  it("returns null rather than a total that quietly dropped a leg", () => {
    const total = aggregateBalancesInAsset(
      [
        { amount: "100", assetCode: "USDC" },
        { amount: "100", assetCode: "BTC" },
      ],
      "USDC",
      rates
    );
    assert.equal(total, null);
    assert.equal(aggregateBalancesInAsset([], "USDC", rates), null);
  });
});

describe("formatAssetEquivalent — conversion display helper", () => {
  const rates = assetExchangeRates({ xlm: 0.5, usdc: 1, live: true })!;

  it("renders the prefix, truncated decimals and target asset label as one string", () => {
    assert.equal(
      formatAssetEquivalent("100.0000000", "XLM", "USDC", rates),
      "≈ 50.00 USDC"
    );
  });

  it("keeps a negative net position negative", () => {
    assert.equal(
      formatAssetEquivalent("-80.0000000", "XLM", "USDC", rates),
      "≈ -40.00 USDC"
    );
  });

  it("shows more precision only when the amount needs it", () => {
    assert.equal(formatAssetEquivalent("0.1234567", "USDC", "XLM", rates), "≈ 0.2469 XLM");
    assert.equal(formatAssetEquivalent("1", "USDC", "USDC", rates), "≈ 1.00 USDC");
  });

  it("honours a caller-supplied precision and prefix", () => {
    assert.equal(
      formatAssetEquivalent("100", "XLM", "USDC", rates, {
        minDecimals: 0,
        maxDecimals: 0,
        prefix: "=",
      }),
      "= 50 USDC"
    );
  });

  it("returns null instead of a placeholder when the rate or amount is unusable", () => {
    assert.equal(formatAssetEquivalent("100", "BTC", "USDC", rates), null);
    assert.equal(formatAssetEquivalent("", "XLM", "USDC", rates), null);
    assert.equal(formatAssetEquivalent(null, "XLM", "USDC", rates), null);
    assert.equal(formatAssetEquivalent("abc", "XLM", "USDC", rates), null);
    assert.equal(
      formatAssetEquivalent("100", "XLM", "USDC", assetExchangeRates({ xlm: 0, usdc: 1 })),
      null
    );
  });
});
