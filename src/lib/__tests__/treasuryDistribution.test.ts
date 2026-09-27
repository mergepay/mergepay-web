import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTreasuryDistribution, splitTrustlineState } from "../treasury";
import type { TreasuryBalance } from "../types";

function balance(overrides: Partial<TreasuryBalance> = {}): TreasuryBalance {
  return {
    assetCode: "XLM",
    assetIssuer: null,
    balance: "100",
    ...overrides,
  };
}

describe("buildTreasuryDistribution", () => {
  it("reports an empty distribution when nothing is reported", () => {
    const dist = buildTreasuryDistribution([]);
    assert.equal(dist.basis, "none");
    assert.equal(dist.allZero, true);
    assert.deepEqual(dist.assets, []);
    assert.equal(dist.totalValue, 0);
  });

  it("treats all-zero balances as the empty state", () => {
    const dist = buildTreasuryDistribution([
      balance({ assetCode: "XLM", balance: "0" }),
      balance({ assetCode: "USDC", assetIssuer: "GISSUER", balance: "0" }),
    ]);
    assert.equal(dist.basis, "none");
    assert.equal(dist.allZero, true);
    assert.equal(dist.assets.every((a) => a.percent === 0), true);
    assert.equal(dist.assets.every((a) => !a.established), true);
  });

  it("weights slices by the supplied value function", () => {
    const dist = buildTreasuryDistribution(
      [
        balance({ assetCode: "XLM", balance: "100" }),
        balance({ assetCode: "USDC", assetIssuer: "GISSUER", balance: "50" }),
      ],
      // 100 XLM @ $0.10 = $10 ; 50 USDC = $50 → 17% / 83%.
      (amount, assetCode) =>
        assetCode === "USDC" ? parseFloat(amount) : parseFloat(amount) * 0.1
    );

    assert.equal(dist.basis, "value");
    assert.equal(dist.totalValue, 60);
    assert.equal(dist.assets[0].assetCode, "USDC");
    assert.equal(dist.assets[0].percent, 83.3);
    assert.equal(dist.assets[1].assetCode, "XLM");
    assert.equal(dist.assets[1].percent, 16.7);
    assert.equal(dist.assets[0].established, true);
  });

  it("falls back to a relative scale when no value function is known", () => {
    const dist = buildTreasuryDistribution([
      balance({ assetCode: "XLM", balance: "40" }),
      balance({ assetCode: "USDC", assetIssuer: "GISSUER", balance: "10" }),
    ]);

    assert.equal(dist.basis, "relative");
    assert.equal(dist.assets[0].percent, 100);
    assert.equal(dist.assets[1].percent, 25);
    assert.equal(dist.totalValue, 0);
  });

  it("keeps the raw balance string for display", () => {
    const dist = buildTreasuryDistribution([
      balance({ balance: "12.5000000" }),
      balance({ assetCode: "USDC", balance: "3" }),
    ]);
    assert.equal(dist.assets.find((a) => a.assetCode === "XLM")?.balance, "12.5000000");
  });

  it("marks a zero row as not established while keeping it visible", () => {
    const dist = buildTreasuryDistribution([
      balance({ assetCode: "XLM", balance: "0" }),
      balance({ assetCode: "USDC", assetIssuer: "GISSUER", balance: "7" }),
    ]);
    const usdc = dist.assets.find((a) => a.assetCode === "USDC");
    const xlm = dist.assets.find((a) => a.assetCode === "XLM");
    assert.equal(usdc?.established, true);
    assert.equal(xlm?.established, false);
    assert.equal(xlm?.percent, 0);
    assert.equal(dist.allZero, false);
  });

  it("ignores malformed rows instead of throwing", () => {
    const dist = buildTreasuryDistribution([
      null as unknown as TreasuryBalance,
      balance({ balance: "not-a-number" }),
      balance({ assetCode: "USDC", balance: "5" }),
    ]);
    assert.equal(dist.assets.length, 2);
    assert.equal(dist.allZero, false);
  });

  it("rejects negative or non-finite values from the value function", () => {
    const dist = buildTreasuryDistribution(
      [balance({ assetCode: "XLM", balance: "10" })],
      () => Number.NaN
    );
    assert.equal(dist.assets[0].value, 0);
    assert.equal(dist.totalValue, 0);
  });

  it("handles a missing balances array", () => {
    const dist = buildTreasuryDistribution(undefined);
    assert.equal(dist.basis, "none");
    assert.equal(dist.allZero, true);
  });

  it("injects expected assets the treasury never reported", () => {
    const dist = buildTreasuryDistribution(
      [balance({ assetCode: "XLM", balance: "40" })],
      undefined,
      ["XLM", "USDC"]
    );
    assert.equal(dist.assets.length, 2);
    const usdc = dist.assets.find((a) => a.assetCode === "USDC");
    assert.equal(usdc?.balance, "0");
    assert.equal(usdc?.established, false);
    assert.equal(usdc?.percent, 0);
    assert.equal(dist.assets.find((a) => a.assetCode === "XLM")?.percent, 100);
  });

  it("does not duplicate an expected asset that was reported", () => {
    const dist = buildTreasuryDistribution(
      [balance({ assetCode: "XLM", balance: "5" })],
      undefined,
      ["xlm"]
    );
    assert.equal(dist.assets.length, 1);
  });
});

describe("splitTrustlineState", () => {
  it("splits expected assets into funded and missing buckets", () => {
    const result = splitTrustlineState(
      ["XLM", "USDC"],
      [balance({ assetCode: "XLM", balance: "10" })]
    );
    assert.deepEqual(result.funded, ["XLM"]);
    assert.deepEqual(result.missing, ["USDC"]);
  });

  it("treats a zero balance as an unestablished trustline", () => {
    const result = splitTrustlineState(
      ["XLM", "USDC"],
      [
        balance({ assetCode: "XLM", balance: "0" }),
        balance({ assetCode: "USDC", assetIssuer: "GISSUER", balance: "1" }),
      ]
    );
    assert.deepEqual(result.funded, ["USDC"]);
    assert.deepEqual(result.missing, ["XLM"]);
  });

  it("reports every asset as missing when the treasury reports nothing", () => {
    const result = splitTrustlineState(["XLM", "USDC"], []);
    assert.deepEqual(result.funded, []);
    assert.deepEqual(result.missing, ["XLM", "USDC"]);
  });
});
