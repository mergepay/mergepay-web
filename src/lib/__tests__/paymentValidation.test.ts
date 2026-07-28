import { describe, it } from "node:test";
import assert from "node:assert";
import {
  validateStellarAmount,
  validateSettlementAsset,
  validateSettlementInput,
} from "../paymentValidation";

describe("validateStellarAmount", () => {
  it("rejects empty string", () => {
    const r = validateStellarAmount("");
    assert.strictEqual(r.valid, false);
    assert.ok(r.error);
  });

  it("rejects whitespace-only string", () => {
    const r = validateStellarAmount("   ");
    assert.strictEqual(r.valid, false);
  });

  it("rejects non-numeric string", () => {
    const r = validateStellarAmount("abc");
    assert.strictEqual(r.valid, false);
  });

  it("rejects negative number", () => {
    const r = validateStellarAmount("-5");
    assert.strictEqual(r.valid, false);
  });

  it("rejects zero", () => {
    const r = validateStellarAmount("0");
    assert.strictEqual(r.valid, false);
  });

  it("rejects zero decimal", () => {
    const r = validateStellarAmount("0.0");
    assert.strictEqual(r.valid, false);
  });

  it("accepts valid positive integer", () => {
    const r = validateStellarAmount("100");
    assert.strictEqual(r.valid, true);
  });

  it("accepts valid decimal", () => {
    const r = validateStellarAmount("42.50");
    assert.strictEqual(r.valid, true);
  });

  it("accepts 7 decimal places", () => {
    const r = validateStellarAmount("1.1234567");
    assert.strictEqual(r.valid, true);
  });

  it("rejects 8 decimal places", () => {
    const r = validateStellarAmount("1.12345678");
    assert.strictEqual(r.valid, false);
  });

  it("rejects over-precision value with 8 decimals", () => {
    const r = validateStellarAmount("0.00000001");
    assert.strictEqual(r.valid, false);
  });

  it("accepts pasted value with leading zeros", () => {
    const r = validateStellarAmount("00042.50");
    assert.strictEqual(r.valid, true);
  });

  it("rejects locale-formatted comma", () => {
    const r = validateStellarAmount("1,234.56");
    assert.strictEqual(r.valid, false);
  });
});

describe("validateSettlementAsset", () => {
  it("accepts XLM", () => {
    const r = validateSettlementAsset("XLM", null);
    assert.strictEqual(r.valid, true);
  });

  it("rejects unsupported asset code", () => {
    const r = validateSettlementAsset("BTC", null);
    assert.strictEqual(r.valid, false);
  });

  it("rejects XLM with non-null issuer", () => {
    const r = validateSettlementAsset("XLM", "GABC");
    assert.strictEqual(r.valid, false);
  });
});

describe("validateSettlementInput", () => {
  it("rejects invalid amount", () => {
    const r = validateSettlementInput({
      amount: "",
      assetCode: "XLM",
    });
    assert.strictEqual(r.valid, false);
  });

  it("rejects unsupported asset", () => {
    const r = validateSettlementInput({
      amount: "100",
      assetCode: "BTC",
    });
    assert.strictEqual(r.valid, false);
  });

  it("accepts valid XLM settlement", () => {
    const r = validateSettlementInput({
      amount: "50",
      assetCode: "XLM",
    });
    assert.strictEqual(r.valid, true);
  });
});
