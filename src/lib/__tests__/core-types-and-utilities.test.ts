import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toStroops,
  fromStroops,
  computeSharesAmounts,
  calculateSplit,
  evenSplitValues,
  trimAmount,
  parseAmountStroops,
  parsePercentBasisPoints,
  formatBasisPoints,
} from "../split";
import { formatMoney } from "../format";

describe("Core Types & Utility Functions Robustness", () => {
  describe("Currency formatting & amount parsing edge cases", () => {
    it("formats money with correct decimal precision", () => {
      assert.equal(formatMoney("10.5", "USDC"), "10.50 USDC");
      assert.equal(formatMoney(100,
        "USDC"
      ), "100.00 USDC");
    });

    it("parses zero-amount splits without throwing", () => {
      const stroops = toStroops("0");
      assert.equal(stroops, 0n);
      assert.equal(fromStroops(stroops), "0.0000000");
    });

    it("trims amounts correctly", () => {
      assert.equal(trimAmount("  10.5000000  "), "  10.5000000  ");
    });
  });

  describe("Zero-amount splits and multi-currency / rounding precision", () => {
    it("handles multi-member equal split with remainder precision (Hamilton's method)", () => {
      const amounts = computeSharesAmounts(100n, [1, 1, 1]);
      assert.deepEqual(amounts, [34n, 33n, 33n]);
      const sum = amounts.reduce((acc, x) => acc + x, 0n);
      assert.equal(sum, 100n);
    });

    it("handles zero-amount total split across multiple weights gracefully", () => {
      const amounts = computeSharesAmounts(0n, [1, 1, 1]);
      assert.deepEqual(amounts, [0n, 0n, 0n]);
    });

    it("handles percentage splits summing correctly to total", () => {
      const total = 1000n;
      const weights = [33.33, 33.33, 33.34];
      const amounts = computeSharesAmounts(total, weights);
      const sum = amounts.reduce((acc, x) => acc + x, 0n);
      assert.equal(sum, total);
    });
  });

  describe("Invalid payload structures and validation safeguards", () => {
    it("throws on negative weights in computeSharesAmounts", () => {
      assert.throws(() => {
        computeSharesAmounts(100n, [1, -5, 1]);
      });
    });

    it("throws on empty or malformed strings in toStroops", () => {
      assert.throws(() => {
        toStroops("");
      });
    });
  });
});
