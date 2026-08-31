import { describe, expect, it } from "vitest";
import {
  estimateFiatFee,
  estimateStellarFee,
  ledgerInclusionLabel,
  STELLAR_BASE_FEE_STROOPS,
} from "./feeEstimation";

describe("estimateStellarFee", () => {
  it("charges the base fee for a single operation", () => {
    const estimate = estimateStellarFee(1);
    expect(estimate.baseFeeStroops).toBe(STELLAR_BASE_FEE_STROOPS);
    expect(estimate.totalFeeStroops).toBe(100n);
    expect(estimate.feeXlm).toBe("0.00001");
  });

  it("scales linearly with operation count", () => {
    const estimate = estimateStellarFee(5);
    expect(estimate.baseFeeStroops).toBe(500n);
    expect(estimate.totalFeeStroops).toBe(500n);
    expect(estimate.feeXlm).toBe("0.00005");
  });

  it("clamps invalid or zero counts to one operation", () => {
    expect(estimateStellarFee(0).operationCount).toBe(1);
    expect(estimateStellarFee(-3).operationCount).toBe(1);
    expect(estimateStellarFee(2.9).operationCount).toBe(2);
  });

  it("adds a resource fee when modelling Soroban operations", () => {
    const estimate = estimateStellarFee(2, { resourceStroopsPerOp: 150 });
    expect(estimate.baseFeeStroops).toBe(200n);
    expect(estimate.resourceFeeStroops).toBe(300n);
    expect(estimate.totalFeeStroops).toBe(500n);
    expect(estimate.feeXlm).toBe("0.00005");
  });

  it("estimates a fast ledger inclusion for small batches", () => {
    expect(estimateStellarFee(1).ledgerEstimateSeconds).toBe(5);
    expect(estimateStellarFee(3).ledgerEstimateSeconds).toBe(5);
    // Large batches can take an extra ledger.
    expect(estimateStellarFee(12).ledgerEstimateSeconds).toBe(10);
  });
});

describe("estimateFiatFee", () => {
  it("converts a fee to USD at the indicative rate", () => {
    // 0.00001 XLM × 0.5 USD/XLM = 0.000005 USD
    const value = estimateFiatFee("0.00001", { currency: "USD" });
    expect(value).toBeCloseTo(0.000005, 9);
  });

  it("converts to another fiat currency via the indicative rates", () => {
    const usd = estimateFiatFee("0.00002", { currency: "USD" }) ?? 0;
    const eur = estimateFiatFee("0.00002", { currency: "EUR" }) ?? 0;
    // 1 EUR = 1.09 USD, so the EUR figure is smaller.
    expect(eur).toBeCloseTo(usd / 1.09, 9);
  });

  it("honors an injected XLM→USD rate", () => {
    const value = estimateFiatFee("1", {
      currency: "USD",
      xlmUsdRate: 0.25,
    });
    expect(value).toBe(0.25);
  });

  it("returns null for invalid fees", () => {
    expect(estimateFiatFee("abc", { currency: "USD" })).toBeNull();
    expect(estimateFiatFee(-1, { currency: "USD" })).toBeNull();
  });
});

describe("ledgerInclusionLabel", () => {
  it("formats seconds as a short label", () => {
    expect(ledgerInclusionLabel(5)).toBe("~5s");
    expect(ledgerInclusionLabel(10)).toBe("~10s");
  });
});
