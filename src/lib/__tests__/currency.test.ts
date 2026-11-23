import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateGroupBalances,
  formatAssetAmount,
  normalizeAssetCode,
  UNKNOWN_ASSET_LABEL,
} from "../currency";
import type { Expense, GroupMember, User } from "../types";

describe("calculateGroupBalances", () => {
  const userA: User = {
    id: "user-1",
    stellarPublicKey: "GUSER1",
    displayName: "Alice",
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00Z",
  };
  const userB: User = {
    id: "user-2",
    stellarPublicKey: "GUSER2",
    displayName: "Bob",
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00Z",
  };

  const members: GroupMember[] = [
    {
      id: "m1",
      groupId: "g1",
      userId: "user-1",
      role: "admin",
      joinedAt: "2026-01-01",
      user: userA,
    },
    {
      id: "m2",
      groupId: "g1",
      userId: "user-2",
      role: "member",
      joinedAt: "2026-01-01",
      user: userB,
    },
  ];

  it("calculates basic single-asset net balances correctly", () => {
    const expenses: Expense[] = [
      {
        id: "e1",
        groupId: "g1",
        payerUserId: "user-1",
        payer: userA,
        title: "Dinner",
        description: null,
        amount: "100.0000000",
        assetCode: "XLM",
        assetIssuer: null,
        splitType: "equal",
        memo: null,
        receiptUrl: null,
        createdAt: "2026-01-01",
        shares: [
          { id: "s1", expenseId: "e1", userId: "user-1", user: userA, shareAmount: "50.0000000", status: "pending" },
          { id: "s2", expenseId: "e1", userId: "user-2", user: userB, shareAmount: "50.0000000", status: "pending" },
        ],
      },
    ];

    const balances = calculateGroupBalances(expenses, members);
    assert.equal(balances.length, 2);
    const alice = balances.find((b) => b.userId === "user-1");
    const bob = balances.find((b) => b.userId === "user-2");
    assert.equal(alice?.net, "50.0000000");
    assert.equal(bob?.net, "-50.0000000");
  });

  it("handles mixed asset conversion and zero-rate fallback scenarios", () => {
    const expenses: Expense[] = [
      {
        id: "e1",
        groupId: "g1",
        payerUserId: "user-1",
        payer: userA,
        title: "XLM Expense",
        description: null,
        amount: "100.0000000",
        assetCode: "XLM",
        assetIssuer: null,
        splitType: "equal",
        memo: null,
        receiptUrl: null,
        createdAt: "2026-01-01",
        shares: [
          { id: "s1", expenseId: "e1", userId: "user-1", user: userA, shareAmount: "100.0000000", status: "pending" },
        ],
      },
      {
        id: "e2",
        groupId: "g1",
        payerUserId: "user-1",
        payer: userA,
        title: "USDC Expense",
        description: null,
        amount: "50.0000000",
        assetCode: "USDC",
        assetIssuer: null,
        splitType: "equal",
        memo: null,
        receiptUrl: null,
        createdAt: "2026-01-01",
        shares: [
          { id: "s2", expenseId: "e2", userId: "user-1", user: userA, shareAmount: "50.0000000", status: "pending" },
        ],
      },
    ];

    const rates = { "USDC->XLM": 2.0 };
    const consolidated = calculateGroupBalances(expenses, members, rates, "XLM");
    assert.equal(consolidated.length, 1);
    const alice = consolidated[0];
    assert.equal(alice.assetCode, "XLM");
    assert.equal(alice.unpriced, false);

    const zeroRates = { "USDC->XLM": 0 };
    const fallbackConsolidated = calculateGroupBalances(expenses, members, zeroRates, "XLM");
    assert.equal(fallbackConsolidated[0].unpriced, true);
  });
});
