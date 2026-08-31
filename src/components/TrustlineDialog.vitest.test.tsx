import { describe, it, expect } from "vitest";
import { isAssetNative, checkAccountHasTrustline } from "./TrustlineDialog";

describe("isAssetNative", () => {
  it("returns true for XLM", () => {
    expect(isAssetNative("XLM")).toBe(true);
  });

  it("returns true for xlm (case-insensitive)", () => {
    expect(isAssetNative("xlm")).toBe(true);
  });

  it("returns true for NATIVE", () => {
    expect(isAssetNative("NATIVE")).toBe(true);
  });

  it("returns false for USDC", () => {
    expect(isAssetNative("USDC")).toBe(false);
  });

  it("returns false for custom assets", () => {
    expect(isAssetNative("MOON")).toBe(false);
  });
});

describe("checkAccountHasTrustline", () => {
  const balances = [
    { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "GA5...ISSUER" },
    { asset_type: "credit_alphanum4", asset_code: "EURC", asset_issuer: "GB6...OTHER" },
  ];

  it("returns true for native XLM regardless of balances", () => {
    expect(checkAccountHasTrustline(balances, "XLM")).toBe(true);
  });

  it("returns true when trustline exists", () => {
    expect(
      checkAccountHasTrustline(balances, "USDC", "GA5...ISSUER"),
    ).toBe(true);
  });

  it("returns false when trustline is missing", () => {
    expect(
      checkAccountHasTrustline(balances, "USDC", "DIFFERENT...ISSUER"),
    ).toBe(false);
  });

  it("returns true when issuer is null", () => {
    expect(checkAccountHasTrustline(balances, "USDC", null)).toBe(true);
  });

  it("returns false for asset code not in balances", () => {
    expect(
      checkAccountHasTrustline(balances, "MOON", "GA5...ISSUER"),
    ).toBe(false); // issuer matches but asset code doesn't
  });

  it("is case-insensitive for asset code", () => {
    expect(
      checkAccountHasTrustline(balances, "usdc", "GA5...ISSUER"),
    ).toBe(true);
  });

  it("is case-insensitive for issuer", () => {
    expect(
      checkAccountHasTrustline(balances, "USDC", "ga5...issuer"),
    ).toBe(true);
  });

  it("returns true for empty balances when native", () => {
    expect(checkAccountHasTrustline([], "XLM")).toBe(true);
  });

  it("returns false for empty balances with non-native asset", () => {
    expect(
      checkAccountHasTrustline([], "USDC", "GA5...ISSUER"),
    ).toBe(false);
  });
});
