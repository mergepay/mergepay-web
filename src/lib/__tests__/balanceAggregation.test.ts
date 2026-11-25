import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateBalancesByAsset,
  getSortedAggregatedBalances,
  calculateTotalNetPosition,
} from "../balanceAggregation";
import type { MemberBalance } from "../types";

describe("balanceAggregation", () => {
  const sampleBalances: MemberBalance[] = [
    {
      userId: "user-1",
      user: { id: "user-1", stellarPublicKey: "key1", displayName: "Alice", avatarUrl: null, createdAt: "2024-01-01" },
      net: "100.0000000",
      assetCode: "XLM",
    },
    {
      userId: "user-1",
      user: { id: "user-1", stellarPublicKey: "key1", displayName: "Alice", avatarUrl: null, createdAt: "2024-01-01" },
      net: "50.0000000",
      assetCode: "USDC",
    },
    {
      userId: "user-1",
      user: { id: "user-1", stellarPublicKey: "key1", displayName: "Alice", avatarUrl: null, createdAt: "2024-01-01" },
      net: "-25.0000000",
      assetCode: "XLM",
    },
    {
      userId: "user-2",
      user: { id: "user-2", stellarPublicKey: "key2", displayName: "Bob", avatarUrl: null, createdAt: "2024-01-01" },
      net: "75.0000000",
      assetCode: "XLM",
    },
    {
      userId: "user-2",
      user: { id: "user-2", stellarPublicKey: "key2", displayName: "Bob", avatarUrl: null, createdAt: "2024-01-01" },
      net: "-10.0000000",
      assetCode: "USDC",
    },
  ];

  describe("aggregateBalancesByAsset", () => {
    it("aggregates balances across all users by asset code", () => {
      const result = aggregateBalancesByAsset(sampleBalances);
      
      assert.equal(result.size, 2);
      
      const xlm = result.get("XLM");
      assert.ok(xlm);
      assert.equal(xlm.assetCode, "XLM");
      assert.equal(xlm.net, "150.0000000"); // 100 - 25 + 75
      assert.equal(xlm.count, 3);
      
      const usdc = result.get("USDC");
      assert.ok(usdc);
      assert.equal(usdc.assetCode, "USDC");
      assert.equal(usdc.net, "40.0000000"); // 50 - 10
      assert.equal(usdc.count, 2);
    });

    it("filters balances by user ID when provided", () => {
      const result = aggregateBalancesByAsset(sampleBalances, "user-1");
      
      assert.equal(result.size, 2);
      
      const xlm = result.get("XLM");
      assert.ok(xlm);
      assert.equal(xlm.net, "75.0000000"); // 100 - 25
      assert.equal(xlm.count, 2);
      
      const usdc = result.get("USDC");
      assert.ok(usdc);
      assert.equal(usdc.net, "50.0000000");
      assert.equal(usdc.count, 1);
    });

    it("handles empty balance array", () => {
      const result = aggregateBalancesByAsset([]);
      assert.equal(result.size, 0);
    });

    it("handles mixed positive and negative balances correctly", () => {
      const mixedBalances: MemberBalance[] = [
        {
          userId: "user-1",
          user: { id: "user-1", stellarPublicKey: "key1", displayName: "Alice", avatarUrl: null, createdAt: "2024-01-01" },
          net: "100.0000000",
          assetCode: "XLM",
        },
        {
          userId: "user-1",
          user: { id: "user-1", stellarPublicKey: "key1", displayName: "Alice", avatarUrl: null, createdAt: "2024-01-01" },
          net: "-150.0000000",
          assetCode: "XLM",
        },
      ];
      
      const result = aggregateBalancesByAsset(mixedBalances);
      const xlm = result.get("XLM");
      assert.ok(xlm);
      assert.equal(xlm.net, "-50.0000000");
    });

    it("skips invalid balance amounts", () => {
      const invalidBalances: MemberBalance[] = [
        {
          userId: "user-1",
          user: { id: "user-1", stellarPublicKey: "key1", displayName: "Alice", avatarUrl: null, createdAt: "2024-01-01" },
          net: "invalid",
          assetCode: "XLM",
        },
        {
          userId: "user-1",
          user: { id: "user-1", stellarPublicKey: "key1", displayName: "Alice", avatarUrl: null, createdAt: "2024-01-01" },
          net: "50.0000000",
          assetCode: "XLM",
        },
      ];
      
      const result = aggregateBalancesByAsset(invalidBalances);
      const xlm = result.get("XLM");
      assert.ok(xlm);
      assert.equal(xlm.net, "50.0000000");
      assert.equal(xlm.count, 1);
    });
  });

  describe("getSortedAggregatedBalances", () => {
    it("returns array sorted by asset code", () => {
      const aggregation = aggregateBalancesByAsset(sampleBalances);
      const sorted = getSortedAggregatedBalances(aggregation);
      
      assert.equal(sorted.length, 2);
      assert.equal(sorted[0].assetCode, "USDC");
      assert.equal(sorted[1].assetCode, "XLM");
    });

    it("returns empty array for empty aggregation", () => {
      const result = getSortedAggregatedBalances(new Map());
      assert.deepEqual(result, []);
    });
  });

  describe("calculateTotalNetPosition", () => {
    it("calculates total stroops across all assets", () => {
      const aggregation = aggregateBalancesByAsset(sampleBalances);
      const result = calculateTotalNetPosition(aggregation);
      
      // XLM: 150, USDC: 40 = 190 total (but they're different assets, so this is just a count)
      assert.equal(result.byAsset.length, 2);
      assert.ok(result.totalStroops !== 0n);
    });

    it("returns zero for empty aggregation", () => {
      const result = calculateTotalNetPosition(new Map());
      assert.equal(result.totalStroops, 0n);
      assert.deepEqual(result.byAsset, []);
    });
  });
});
