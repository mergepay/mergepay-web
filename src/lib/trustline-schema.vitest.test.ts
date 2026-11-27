import { describe, expect, it } from "vitest";
import { TrustlineAssetSchema } from "./trustline-schema";

const issuer = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

describe("TrustlineAssetSchema", () => {
  it.each(["", "TOO_LONG_CODE", "US-DC", "USD C", "é", "XLM"])(
    "rejects malformed or native asset code %j",
    (assetCode) => {
      expect(TrustlineAssetSchema.safeParse({ assetCode, assetIssuer: issuer }).success).toBe(false);
    }
  );

  it.each(["", "G123", "A".repeat(56), "G" + "A".repeat(55), "G" + "a".repeat(55)])(
    "rejects malformed or invalid-checksum G-address %j",
    (assetIssuer) => {
      expect(TrustlineAssetSchema.safeParse({ assetCode: "USDC", assetIssuer }).success).toBe(false);
    }
  );

  it.each(["A", "USDC", "Ab12", "A".repeat(12)])(
    "accepts a valid issued asset %j",
    (assetCode) => {
      expect(TrustlineAssetSchema.parse({ assetCode, assetIssuer: issuer })).toEqual({
        assetCode,
        assetIssuer: issuer,
      });
    }
  );
});
