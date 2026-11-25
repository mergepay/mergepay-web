import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appendPendingInvite,
  buildPendingInvite,
  findExpenseInCaches,
  removePendingInvite,
  replacePendingInvite,
  reverseOptimisticExpenseBalances,
} from "../optimistic";
import type {
  BalancesResponse,
  Expense,
  GroupDetail,
  GroupMember,
  Invite,
  User,
} from "../types";

const ALICE: User = {
  id: "user-1",
  stellarPublicKey: "GALICE",
  displayName: "Alice",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const BOB: User = {
  id: "user-2",
  stellarPublicKey: "GBOB",
  displayName: "Bob",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const MEMBERS: GroupMember[] = [
  {
    id: "mem-1",
    groupId: "grp-1",
    userId: ALICE.id,
    role: "admin",
    joinedAt: "2026-01-01T00:00:00.000Z",
    user: ALICE,
  },
];

function detail(): GroupDetail {
  return {
    group: {
      id: "grp-1",
      name: "Trip",
      description: null,
      createdByUserId: ALICE.id,
      treasuryEnabled: false,
      treasuryAccountPublicKey: null,
      treasuryRequiredSigners: null,
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    members: MEMBERS,
    yourRole: "admin",
  };
}

function serverInvite(overrides: Partial<Invite> = {}): Invite {
  return {
    id: "inv-1",
    groupId: "grp-1",
    code: "ABCD1234",
    url: "https://mergepay.app/join/ABCD1234?group=grp-1",
    expiresAt: "2026-02-01T00:00:00.000Z",
    maxUses: 5,
    uses: 0,
    createdAt: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

function expense(): Expense {
  return {
    id: "exp-1",
    groupId: "grp-1",
    payerUserId: ALICE.id,
    payer: ALICE,
    title: "Dinner",
    description: null,
    amount: "100.0000000",
    assetCode: "XLM",
    assetIssuer: null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2026-01-15T00:00:00.000Z",
    shares: [
      {
        id: "sh-1",
        expenseId: "exp-1",
        userId: ALICE.id,
        user: ALICE,
        shareAmount: "50.0000000",
        status: "pending",
      },
      {
        id: "sh-2",
        expenseId: "exp-1",
        userId: BOB.id,
        user: BOB,
        shareAmount: "50.0000000",
        status: "pending",
      },
    ],
  };
}

function balances(): BalancesResponse {
  return {
    balances: [
      { userId: ALICE.id, user: ALICE, net: "50.0000000", assetCode: "XLM" },
      { userId: BOB.id, user: BOB, net: "-50.0000000", assetCode: "XLM" },
    ],
    suggestions: [],
  };
}

describe("optimistic group invites (#812)", () => {
  it("builds a pending invite carrying the requested limits", () => {
    const now = new Date("2026-01-15T12:00:00.000Z");
    const pending = buildPendingInvite({
      groupId: "grp-1",
      request: { maxUses: 3, expiresInHours: 24 },
      now,
    });

    assert.match(pending.id, /^optimistic-invite-/);
    assert.equal(pending.code, null);
    assert.equal(pending.maxUses, 3);
    assert.equal(pending.expiresAt, "2026-01-16T12:00:00.000Z");
    assert.equal(pending.pending, true);
  });

  it("leaves expiry unset when the admin asked for a never-expiring invite", () => {
    const pending = buildPendingInvite({
      groupId: "grp-1",
      request: {},
      now: new Date("2026-01-15T12:00:00.000Z"),
    });
    assert.equal(pending.expiresAt, null);
    assert.equal(pending.maxUses, null);
  });

  it("appends the pending invite without mutating the snapshot", () => {
    const before = detail();
    const pending = buildPendingInvite({ groupId: "grp-1" });
    const after = appendPendingInvite(before, pending);

    assert.equal(before.pendingInvites, undefined);
    assert.equal(after?.pendingInvites?.length, 1);
    assert.equal(after?.pendingInvites?.[0].id, pending.id);
  });

  it("does not duplicate an invite already in the cache", () => {
    const pending = buildPendingInvite({ groupId: "grp-1" });
    const once = appendPendingInvite(detail(), pending);
    const twice = appendPendingInvite(once, pending);

    assert.equal(twice?.pendingInvites?.length, 1);
    assert.equal(twice, once);
  });

  it("replaces the placeholder with the server invite on success", () => {
    const pending = buildPendingInvite({ groupId: "grp-1" });
    const optimistic = appendPendingInvite(detail(), pending);
    const reconciled = replacePendingInvite(
      optimistic,
      pending.id,
      serverInvite()
    );

    assert.equal(reconciled?.pendingInvites?.length, 1);
    assert.equal(reconciled?.pendingInvites?.[0].id, "inv-1");
    assert.equal(reconciled?.pendingInvites?.[0].code, "ABCD1234");
    assert.equal(reconciled?.pendingInvites?.[0].pending, false);
  });

  it("drops a pending invite when asked to remove it", () => {
    const pending = buildPendingInvite({ groupId: "grp-1" });
    const optimistic = appendPendingInvite(detail(), pending);

    assert.equal(
      removePendingInvite(optimistic, pending.id)?.pendingInvites?.length,
      0
    );
  });
});

describe("optimistic expense deletion balances (#818)", () => {
  it("finds an expense in a flat list cache", () => {
    const found = findExpenseInCaches(
      [[["groups", "grp-1", "expenses"], { expenses: [expense()] }]],
      "exp-1"
    );
    assert.equal(found?.id, "exp-1");
  });

  it("finds an expense in an infinite-query cache", () => {
    const found = findExpenseInCaches(
      [
        [
          ["groups", "grp-1", "expenses", "page", 20, null],
          { pages: [{ expenses: [expense()], nextCursor: null }], pageParams: [undefined] },
        ],
      ],
      "exp-1"
    );
    assert.equal(found?.id, "exp-1");
  });

  it("reverses the payer and participant nets when an expense is deleted", () => {
    const reverted = reverseOptimisticExpenseBalances(balances(), expense());

    assert.equal(reverted.balances[0].net, "0");
    assert.equal(reverted.balances[1].net, "0");
  });

  it("leaves other assets and unrelated members untouched", () => {
    const mixed: BalancesResponse = {
      balances: [
        { userId: ALICE.id, user: ALICE, net: "10.0000000", assetCode: "USDC" },
        { userId: ALICE.id, user: ALICE, net: "50.0000000", assetCode: "XLM" },
        { userId: BOB.id, user: BOB, net: "-50.0000000", assetCode: "XLM" },
      ],
      suggestions: [],
    };

    const reverted = reverseOptimisticExpenseBalances(mixed, expense());
    assert.equal(reverted.balances[0].net, "10.0000000");
    assert.equal(reverted.balances[1].net, "0");
    assert.equal(reverted.balances[2].net, "0");
  });

  it("skips expenses without share data rather than guessing", () => {
    const noShares = { ...expense(), shares: [] };
    const original = balances();
    assert.equal(reverseOptimisticExpenseBalances(original, noShares), original);
  });
});
