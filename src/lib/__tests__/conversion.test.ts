import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RatePayloadSchema,
  RatePairSchema,
  ConversionRequestSchema,
  ConversionResultSchema,
  calculateConversion,
  resolveRate,
  validateRatePayload,
  DEFAULT_FALLBACK_RATES,
} from "../conversion";

describe("Currency Conversion Module (Issue #220)", () => {
  describe("Zod Validation Schemas", () => {
    it("validates a standard exchange rate payload", () => {
      const validPayload = {
        rates: {
          "XLM-USDC": 0.12,
          "USDC-XLM": 8.3333333,
        },
        baseAsset: "USD",
        timestamp: 1700000000000,
        live: true,
        sources: ["coingecko"],
      };

      const result = validateRatePayload(validPayload);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.rates["XLM-USDC"], 0.12);
        assert.equal(result.data.live, true);
      }
    });

    it("rejects non-positive rates in RatePayloadSchema", () => {
      const invalidPayload = {
        rates: {
          "XLM-USDC": -0.12,
        },
      };

      const result = validateRatePayload(invalidPayload);
      assert.equal(result.success, false);
    });

    it("validates RatePairSchema", () => {
      const validPair = { from: "XLM", to: "USDC", rate: 0.125 };
      const parsed = RatePairSchema.safeParse(validPair);
      assert.equal(parsed.success, true);

      const invalidPair = { from: "", to: "USDC", rate: 0 };
      const failed = RatePairSchema.safeParse(invalidPair);
      assert.equal(failed.success, false);
    });

    it("validates ConversionRequestSchema and ConversionResultSchema", () => {
      const req = ConversionRequestSchema.safeParse({
        amount: "100",
        fromAsset: "USD",
        toAsset: "USDC",
      });
      assert.equal(req.success, true);

      const res = ConversionResultSchema.safeParse({
        sourceAmount: "100",
        sourceCurrency: "USD",
        targetAmount: "100.0000000",
        targetCurrency: "USDC",
        rate: 1.0,
        formatted: "100.0000000 USDC",
        isFallback: false,
      });
      assert.equal(res.success, true);
    });
  });

  describe("Edge Cases: Zero Amounts", () => {
    it("correctly handles zero as numeric 0 without NaN or failure", () => {
      const result = calculateConversion(0, "USD", "USDC", {
        rates: { "USD-USDC": 1.0 },
        baseAsset: "USD",
        timestamp: Date.now(),
        live: true,
      });

      assert.equal(result.error, null);
      assert.equal(result.sourceAmount, "0");
      assert.equal(result.targetAmount, "0.0000000"); // USDC is 7 decimals
      assert.equal(result.rate, 1.0);
    });

    it("correctly handles zero as string '0' and '0.00'", () => {
      const res1 = calculateConversion("0", "XLM", "USD", { "XLM-USD": 0.12 });
      assert.equal(res1.targetAmount, "0.00"); // USD is 2 decimals
      assert.equal(res1.error, null);

      const res2 = calculateConversion("0.00", "USD", "XLM", { "USD-XLM": 8.3333333 });
      assert.equal(res2.targetAmount, "0.0000000");
      assert.equal(res2.error, null);
    });
  });

  describe("Rate Fluctuations and Precision", () => {
    it("handles extreme rate fluctuations (micro rates / large multipliers)", () => {
      // Extremely small rate (e.g. 1 ARS = 0.001 USD)
      const smallRateResult = calculateConversion("5000", "ARS", "USD", { "ARS-USD": 0.001 });
      assert.equal(smallRateResult.error, null);
      assert.equal(smallRateResult.targetAmount, "5.00");

      // Extremely large rate (e.g. 1 USD = 1600 NGN)
      const largeRateResult = calculateConversion("25.5", "USD", "NGN", { "USD-NGN": 1600 });
      assert.equal(largeRateResult.error, null);
      assert.equal(largeRateResult.targetAmount, "40800.00");

      // Rate fluctuation test: consecutive conversions with fluctuating rates
      const rate1 = calculateConversion("100", "XLM", "USDC", { "XLM-USDC": 0.115 });
      assert.equal(rate1.targetAmount, "11.5000000");

      const rate2 = calculateConversion("100", "XLM", "USDC", { "XLM-USDC": 0.1425 });
      assert.equal(rate2.targetAmount, "14.2500000");
    });

    it("supports custom precision overrides", () => {
      const res = calculateConversion("10", "USD", "EUR", { "USD-EUR": 0.9259259 }, { precision: 4 });
      assert.equal(res.targetAmount, "9.2593");
    });
  });

  describe("Currency Resolution & Graph Traversal", () => {
    it("handles same currency conversion with rate 1.0", () => {
      const res = calculateConversion("50.25", "XLM", "XLM");
      assert.equal(res.rate, 1.0);
      assert.equal(res.targetAmount, "50.2500000");
      assert.equal(res.isFallback, false);
    });

    it("derives inverse rate when only reverse pair is provided", () => {
      const rates = { "USDC-XLM": 8.0 };
      const res = calculateConversion("16", "XLM", "USDC", rates);
      assert.equal(res.error, null);
      // 16 / 8 = 2
      assert.equal(res.rate, 0.125);
      assert.equal(res.targetAmount, "2.0000000");
    });

    it("computes cross rates via USD", () => {
      const rates = {
        "EUR-USD": 1.10,
        "USD-CAD": 1.35,
      };
      // EUR -> CAD: 1 EUR = 1.10 USD * 1.35 CAD = 1.485 CAD
      const res = calculateConversion("100", "EUR", "CAD", rates);
      assert.equal(res.error, null);
      assert.equal(res.targetAmount, "148.50");
    });
  });

  describe("Offline and API Failure Handling", () => {
    it("gracefully falls back to DEFAULT_FALLBACK_RATES when rates are empty or undefined", () => {
      const res = calculateConversion("100", "XLM", "USDC", null);
      assert.equal(res.error, null);
      assert.equal(res.isFallback, true);
      assert.equal(res.rate, DEFAULT_FALLBACK_RATES["XLM-USDC"]);
      assert.equal(res.targetAmount, "12.0000000");
    });

    it("flags fallback when payload indicates live is false", () => {
      const payload = {
        rates: { "XLM-USDC": 0.12 },
        baseAsset: "USD",
        timestamp: Date.now(),
        live: false,
      };
      const res = calculateConversion("50", "XLM", "USDC", payload);
      assert.equal(res.isFallback, true);
      assert.equal(res.targetAmount, "6.0000000");
    });

    it("returns error indicator when pair cannot be resolved even in fallback", () => {
      const res = calculateConversion("100", "UNKNOWN_COIN", "ANOTHER_COIN", {});
      assert.equal(res.isFallback, true);
      assert.ok(res.error?.includes("Exchange rate unavailable"));
    });
  });

  describe("Invalid Input Handling", () => {
    it("returns error for negative amounts", () => {
      const res = calculateConversion("-50", "USD", "USDC");
      assert.equal(res.error, "Amount cannot be negative");
    });

    it("returns error for malformed strings", () => {
      const res = calculateConversion("not-a-number", "USD", "USDC");
      assert.equal(res.error, "Invalid amount format");
    });
  });
});
