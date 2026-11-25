import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatStellarAssetAmount } from "../currency";
import type { TreasuryBalance, TreasuryTransaction } from "../types";

describe("formatStellarAssetAmount (#626)", () => {
  it("formats native XLM at Stellar precision without an issuer", () => {
    const value = formatStellarAssetAmount("0.0000001", { assetCode: "XLM", assetIssuer: null });
    assert.equal(value.text, "0.0000001 XLM");
    assert.equal(value.issuer, null);
  });

  it("formats USDC and retains its issuer", () => {
    const balance: Pick<TreasuryBalance, "assetCode" | "assetIssuer" | "balance"> = {
      assetCode: "USDC", assetIssuer: "GISSUER", balance: "1234.5000000",
    };
    const value = formatStellarAssetAmount(balance.balance, balance);
    assert.equal(value.text, "1,234.50 USDC");
    assert.equal(value.issuer, "GISSUER");
  });

  it("supports custom trustline codes and preserves their issuer", () => {
    const asset: Pick<TreasuryTransaction, "assetCode" | "assetIssuer"> = {
      assetCode: "community", assetIssuer: "GCOMMUNITY",
    };
    const value = formatStellarAssetAmount("0.0000123", asset);
    assert.equal(value.text, "0.0000123 COMMUNITY");
    assert.equal(value.issuer, "GCOMMUNITY");
  });

  it("supports fiat-like two-decimal display and configurable crypto rounding", () => {
    assert.equal(formatStellarAssetAmount("12.345", { assetCode: "USDC" }, { minDecimals: 2, maxDecimals: 2 }).text, "12.35 USDC");
    assert.equal(formatStellarAssetAmount("12.3456789", { assetCode: "XLM" }, { minDecimals: 0, maxDecimals: 4 }).text, "12.3457 XLM");
  });

  it("handles zero, negative zero, invalid input, and null issuer", () => {
    assert.equal(formatStellarAssetAmount("0", { assetCode: "XLM" }).text, "0.00 XLM");
    assert.equal(formatStellarAssetAmount("-0", { assetCode: "USDC", assetIssuer: null }).text, "0.00 USDC");
    assert.equal(formatStellarAssetAmount("bad", { assetCode: "USDC" }).text, "—");
    assert.equal(formatStellarAssetAmount("1", { assetCode: "XLM", assetIssuer: "unexpected" }).issuer, null);
  });
});
