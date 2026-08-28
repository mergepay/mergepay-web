import { describe, it } from "node:test";
import assert from "node:assert";
import {
  formatStellarBalance,
  verifyTrustline,
  calculateAssetBalances,
  HorizonBalanceItem,
  ConfiguredAsset,
} from "../trustline";
import { XLM_ASSET, STABLE_ASSET } from "../constants";

describe("Trustline Balancer & Verification Logic", () => {
  describe("formatStellarBalance", () => {
    it("formats integer strings into strict 7 decimal places", () => {
      assert.strictEqual(formatStellarBalance("10"), "10.0000000");
      assert.strictEqual(formatStellarBalance("0"), "0.0000000");
    });

    it("preserves up to 7 decimal places for fractional amounts", () => {
      assert.strictEqual(formatStellarBalance("1.234"), "1.2340000");
      assert.strictEqual(formatStellarBalance("0.0000001"), "0.0000001");
    });

    it("handles invalid or empty inputs gracefully defaulting to 0.0000000", () => {
      assert.strictEqual(formatStellarBalance(""), "0.0000000");
      assert.strictEqual(formatStellarBalance("invalid"), "0.0000000");
      assert.strictEqual(formatStellarBalance("-5"), "0.0000000");
    });
  });

  describe("verifyTrustline", () => {
    const sampleBalances: HorizonBalanceItem[] = [
      { asset_type: "native", balance: "100.5000000" },
      {
        asset_type: "credit_alphanum4",
        asset_code: "USDC",
        asset_issuer: STABLE_ASSET.issuer,
        balance: "50.0000000",
        limit: "10000.0000000",
      },
    ];

    it("always returns true for native XLM asset", () => {
      assert.strictEqual(verifyTrustline(sampleBalances, XLM_ASSET.code, XLM_ASSET.issuer), true);
      assert.strictEqual(verifyTrustline([], "XLM", null), true);
    });

    it("returns true when non-native trustline exists with matching code and issuer", () => {
      assert.strictEqual(
        verifyTrustline(sampleBalances, "USDC", STABLE_ASSET.issuer),
        true
      );
    });

    it("returns false when trustline is missing for selected non-native asset", () => {
      assert.strictEqual(
        verifyTrustline(sampleBalances, "ARST", "GBBD47IF6LWK2P7MDEVSCWR7DPUWV3NY3DTQEVFL4TWVC5GIOTASH4EU"),
        false
      );
    });

    it("returns false when asset code matches but issuer differs", () => {
      assert.strictEqual(
        verifyTrustline(sampleBalances, "USDC", "GDIFFERENTISSUER1234567890"),
        false
      );
    });
  });

  describe("calculateAssetBalances", () => {
    const configuredAssets: ConfiguredAsset[] = [
      { code: "XLM", issuer: null, name: "Lumen" },
      { code: "USDC", issuer: STABLE_ASSET.issuer, name: "USD Coin" },
      { code: "ARST", issuer: "GBBD47IF6LWK2P7MDEVSCWR7DPUWV3NY3DTQEVFL4TWVC5GIOTASH4EU", name: "Argentine Peso" },
    ];

    const horizonBalances: HorizonBalanceItem[] = [
      { asset_type: "native", balance: "250.75" },
      {
        asset_type: "credit_alphanum4",
        asset_code: "USDC",
        asset_issuer: STABLE_ASSET.issuer,
        balance: "12.34567",
        limit: "1000.0",
      },
    ];

    it("correctly identifies balances and active trustline statuses across configured assets", () => {
      const results = calculateAssetBalances(horizonBalances, configuredAssets);

      assert.strictEqual(results.length, 3);

      // XLM (Native)
      assert.strictEqual(results[0].code, "XLM");
      assert.strictEqual(results[0].hasTrustline, true);
      assert.strictEqual(results[0].balance, "250.7500000");

      // USDC (Trustline active)
      assert.strictEqual(results[1].code, "USDC");
      assert.strictEqual(results[1].hasTrustline, true);
      assert.strictEqual(results[1].balance, "12.3456700");

      // ARST (Trustline missing)
      assert.strictEqual(results[2].code, "ARST");
      assert.strictEqual(results[2].hasTrustline, false);
      assert.strictEqual(results[2].balance, "0.0000000");
    });
  });
});
