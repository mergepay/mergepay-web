import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BalancesResponseSchema,
  ExpensesResponseSchema,
  GroupsResponseSchema,
  GroupDetailSchema,
  HistoryResponseSchema,
  LedgerResponseSchema,
  MeResponseSchema,
  SettlementIntentResponseSchema,
  SettlementResponseSchema,
} from "../schemas";

const user = {
  id: "u1",
  stellarPublicKey: "GABC",
  displayName: "Alice",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
};

const group = {
  id: "g1",
  name: "Trip",
  description: null,
  createdByUserId: "u1",
  treasuryEnabled: false,
  treasuryAccountPublicKey: null,
  treasuryRequiredSigners: null,
  archived: false,
  createdAt: "2026-01-01T00:00:00Z",
};

const settlement = {
  id: "s1",
  groupId: "g1",
  fromUserId: "u1",
  from: user,
  toUserId: "u2",
  to: { ...user, id: "u2", displayName: "Bob" },
  amount: "10.5",
  assetCode: "XLM",
  assetIssuer: null,
  stellarTxHash: null,
  status: "submitted" as const,
  memo: null,
  expenseId: null,
  createdAt: "2026-01-01T00:00:00Z",
};

const expense = {
  id: "e1",
  groupId: "g1",
  payerUserId: "u1",
  payer: user,
  title: "Dinner",
  description: null,
  amount: "60",
  assetCode: "XLM",
  assetIssuer: null,
  splitType: "equal" as const,
  memo: null,
  receiptUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
  shares: [
    {
      id: "sh1",
      expenseId: "e1",
      userId: "u1",
      user,
      shareAmount: "30",
      status: "pending" as const,
    },
    {
      id: "sh2",
      expenseId: "e1",
      userId: "u2",
      user: { ...user, id: "u2", displayName: "Bob" },
      shareAmount: "30",
      status: "pending" as const,
    },
  ],
};

describe("API response schemas", () => {
  it("MeResponseSchema accepts a valid user envelope", () => {
    assert.equal(MeResponseSchema.safeParse({ user }).success, true);
  });

  it("MeResponseSchema rejects missing user", () => {
    assert.equal(MeResponseSchema.safeParse({}).success, false);
  });

  it("GroupsResponseSchema accepts valid groups", () => {
    const ok = GroupsResponseSchema.safeParse({
      groups: [
        {
          ...group,
          memberCount: 2,
          yourNet: "0",
          netAssetCode: "XLM",
        },
      ],
    });
    assert.equal(ok.success, true);
  });

  it("GroupsResponseSchema rejects negative memberCount", () => {
    const bad = GroupsResponseSchema.safeParse({
      groups: [
        {
          ...group,
          memberCount: -1,
          yourNet: "0",
          netAssetCode: "XLM",
        },
      ],
    });
    assert.equal(bad.success, false);
  });

  it("GroupDetailSchema accepts valid group + members + role", () => {
    const ok = GroupDetailSchema.safeParse({
      group,
      members: [
        {
          id: "gm1",
          groupId: "g1",
          userId: "u1",
          role: "admin" as const,
          joinedAt: "2026-01-01T00:00:00Z",
          user,
        },
      ],
      yourRole: "admin" as const,
    });
    assert.equal(ok.success, true);
  });

  it("GroupDetailSchema rejects invalid role", () => {
    const bad = GroupDetailSchema.safeParse({
      group,
      members: [],
      yourRole: "superuser",
    });
    assert.equal(bad.success, false);
  });

  it("ExpensesResponseSchema accepts valid expense list", () => {
    assert.equal(ExpensesResponseSchema.safeParse({ expenses: [expense] }).success, true);
  });

  it("ExpensesResponseSchema rejects malformed share status", () => {
    const broken = {
      ...expense,
      shares: [
        {
          ...expense.shares[0],
          status: "weird-status",
        },
        expense.shares[1],
      ],
    };
    assert.equal(ExpensesResponseSchema.safeParse({ expenses: [broken] }).success, false);
  });

  it("BalancesResponseSchema accepts valid balances + suggestions", () => {
    const u2 = { ...user, id: "u2", displayName: "Bob" };
    assert.equal(
      BalancesResponseSchema.safeParse({
        balances: [
          { userId: "u1", user, net: "0", assetCode: "XLM" },
          { userId: "u2", user: u2, net: "0", assetCode: "XLM" },
        ],
        suggestions: [
          {
            fromUserId: "u1",
            from: user,
            toUserId: "u2",
            to: u2,
            amount: "0",
            assetCode: "XLM",
            assetIssuer: null,
          },
        ],
      }).success,
      true
    );
  });

  it("SettlementResponseSchema accepts every terminal + non-terminal status", () => {
    for (const status of ["pending", "submitted", "confirmed", "failed"] as const) {
      const ok = SettlementResponseSchema.safeParse({
        settlement: { ...settlement, status },
      });
      assert.equal(ok.success, true, `status=${status} should be accepted`);
    }
  });

  it("SettlementResponseSchema rejects unknown status", () => {
    const bad = SettlementResponseSchema.safeParse({
      settlement: { ...settlement, status: "cancelled" },
    });
    assert.equal(bad.success, false);
  });

  it("SettlementIntentResponseSchema requires XDR + passphrase", () => {
    assert.equal(
      SettlementIntentResponseSchema.safeParse({
        settlement,
        xdr: "AAAA",
        networkPassphrase: "Public Global Stellar Network ; September 2015",
      }).success,
      true
    );
    assert.equal(
      SettlementIntentResponseSchema.safeParse({ settlement, xdr: "AAAA" }).success,
      false
    );
  });

  it("LedgerResponseSchema accepts mixed entry types", () => {
    const ok = LedgerResponseSchema.safeParse({
      entries: [
        { type: "expense" as const, createdAt: "2026-01-01", expense },
        {
          type: "settlement" as const,
          createdAt: "2026-01-01",
          settlement,
        },
        {
          type: "treasury" as const,
          createdAt: "2026-01-01",
          treasuryTransaction: {
            id: "tt1",
            groupId: "g1",
            userId: null,
            user: null,
            direction: "deposit" as const,
            amount: "100",
            assetCode: "XLM",
            assetIssuer: null,
            destination: null,
            stellarTxHash: null,
            status: "pending" as const,
            memo: null,
            createdAt: "2026-01-01",
          },
        },
      ],
    });
    assert.equal(ok.success, true);
  });

  it("LedgerResponseSchema rejects an entry with unknown kind", () => {
    const bad = LedgerResponseSchema.safeParse({
      entries: [
        { type: "unknown", createdAt: "2026-01-01", settlement },
      ],
    });
    assert.equal(bad.success, false);
  });

  it("HistoryResponseSchema accepts expenses + settlements arrays", () => {
    assert.equal(
      HistoryResponseSchema.safeParse({ expenses: [expense], settlements: [settlement] })
        .success,
      true
    );
  });
});
