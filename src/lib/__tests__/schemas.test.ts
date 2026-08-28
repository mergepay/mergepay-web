import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AnchorsResponseSchema,
  AnchorSessionResponseSchema,
  AnchorSessionsResponseSchema,
  AnchorStartResponseSchema,
  BalancesResponseSchema,
  ChallengeResponseSchema,
  ExpenseResponseSchema,
  ExpensesResponseSchema,
  GroupDetailSchema,
  GroupResponseSchema,
  GroupsResponseSchema,
  HistoryResponseSchema,
  InviteResponseSchema,
  LedgerResponseSchema,
  MeResponseSchema,
  OkResponseSchema,
  SettlementIntentResponseSchema,
  SettlementResponseSchema,
  TreasuryHistoryResponseSchema,
  TreasuryInfoResponseSchema,
  TreasuryIntentResponseSchema,
  TreasuryTransactionResponseSchema,
  UploadResponseSchema,
  VerifyResponseSchema,
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

const treasuryTx = {
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
};

const invite = {
  id: "inv1",
  groupId: "g1",
  code: "abc123",
  url: "https://mergepay.com/join/abc123",
  expiresAt: null,
  maxUses: null,
  uses: 0,
  createdAt: "2026-01-01T00:00:00Z",
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
      nextCursor: null,
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

  it("HistoryResponseSchema accepts expenses + settlements arrays with nextCursor", () => {
    assert.equal(
      HistoryResponseSchema.safeParse({ expenses: [expense], settlements: [settlement], nextCursor: null })
        .success,
      true
    );
    assert.equal(
      HistoryResponseSchema.safeParse({ expenses: [expense], settlements: [settlement], nextCursor: "cursor-1" })
        .success,
      true
    );
  });

  it("HistoryResponseSchema rejects missing nextCursor", () => {
    assert.equal(
      HistoryResponseSchema.safeParse({ expenses: [expense], settlements: [settlement] }).success,
      false
    );
  });

  // ---- New schemas added in this round ----

  it("ChallengeResponseSchema accepts valid challenge", () => {
    assert.equal(
      ChallengeResponseSchema.safeParse({
        transaction: "AAAAAA==",
        networkPassphrase: "Test SDF Network ; September 2015",
      }).success,
      true
    );
  });

  it("ChallengeResponseSchema rejects missing transaction", () => {
    assert.equal(
      ChallengeResponseSchema.safeParse({
        networkPassphrase: "Test SDF Network ; September 2015",
      }).success,
      false
    );
  });

  it("VerifyResponseSchema accepts valid verify response", () => {
    assert.equal(
      VerifyResponseSchema.safeParse({
        token: "jwt-abc",
        user,
      }).success,
      true
    );
  });

  it("VerifyResponseSchema rejects missing token", () => {
    assert.equal(VerifyResponseSchema.safeParse({ user }).success, false);
  });

  it("OkResponseSchema accepts ok: true", () => {
    assert.equal(OkResponseSchema.safeParse({ ok: true }).success, true);
  });

  it("OkResponseSchema rejects non-boolean ok", () => {
    assert.equal(OkResponseSchema.safeParse({ ok: "yes" }).success, false);
  });

  it("GroupResponseSchema accepts valid group envelope", () => {
    assert.equal(GroupResponseSchema.safeParse({ group }).success, true);
  });

  it("GroupResponseSchema rejects empty object", () => {
    assert.equal(GroupResponseSchema.safeParse({}).success, false);
  });

  it("ExpenseResponseSchema accepts valid expense envelope", () => {
    assert.equal(ExpenseResponseSchema.safeParse({ expense }).success, true);
  });

  it("InviteResponseSchema accepts valid invite", () => {
    assert.equal(InviteResponseSchema.safeParse({ invite }).success, true);
  });

  it("InviteResponseSchema rejects missing fields", () => {
    assert.equal(InviteResponseSchema.safeParse({ invite: { id: "inv1" } }).success, false);
  });

  it("InviteResponseSchema rejects negative uses", () => {
    assert.equal(
      InviteResponseSchema.safeParse({ invite: { ...invite, uses: -1 } }).success,
      false
    );
  });

  it("TreasuryInfoResponseSchema accepts valid treasury info", () => {
    assert.equal(
      TreasuryInfoResponseSchema.safeParse({
        publicKey: "GABC...",
        balances: [{ assetCode: "XLM", assetIssuer: null, balance: "100" }],
        signers: [{ key: "GABC...", weight: 1 }],
        thresholds: { low: 1, med: 2, high: 3 },
      }).success,
      true
    );
  });

  it("TreasuryInfoResponseSchema rejects missing thresholds", () => {
    assert.equal(
      TreasuryInfoResponseSchema.safeParse({
        publicKey: "GABC...",
        balances: [],
        signers: [],
      }).success,
      false
    );
  });

  it("TreasuryIntentResponseSchema accepts valid intent", () => {
    assert.equal(
      TreasuryIntentResponseSchema.safeParse({
        treasuryTransaction: treasuryTx,
        xdr: "AAAA",
        networkPassphrase: "Public Global Stellar Network ; September 2015",
      }).success,
      true
    );
  });

  it("TreasuryIntentResponseSchema rejects missing XDR", () => {
    assert.equal(
      TreasuryIntentResponseSchema.safeParse({
        treasuryTransaction: treasuryTx,
        networkPassphrase: "...",
      }).success,
      false
    );
  });

  it("TreasuryTransactionResponseSchema accepts valid transaction", () => {
    assert.equal(
      TreasuryTransactionResponseSchema.safeParse({
        treasuryTransaction: treasuryTx,
      }).success,
      true
    );
  });

  it("TreasuryHistoryResponseSchema accepts valid transaction list", () => {
    assert.equal(
      TreasuryHistoryResponseSchema.safeParse({
        transactions: [treasuryTx],
      }).success,
      true
    );
  });

  it("AnchorsResponseSchema accepts valid anchor list", () => {
    assert.equal(
      AnchorsResponseSchema.safeParse({
        anchors: [
          {
            name: "TestAnchor",
            homeDomain: "testanchor.com",
            assets: [{ code: "USDC", issuer: null }],
          },
        ],
      }).success,
      true
    );
  });

  it("AnchorsResponseSchema rejects missing homeDomain", () => {
    assert.equal(
      AnchorsResponseSchema.safeParse({
        anchors: [{ name: "TestAnchor", assets: [] }],
      }).success,
      false
    );
  });

  it("AnchorStartResponseSchema accepts valid start response", () => {
    assert.equal(
      AnchorStartResponseSchema.safeParse({
        session: {
          id: "s1",
          userId: "u1",
          anchorName: "TestAnchor",
          kind: "deposit" as const,
          assetCode: "USDC",
          interactiveUrl: null,
          externalTransactionId: null,
          status: "incomplete" as const,
          createdAt: "2026-01-01T00:00:00Z",
        },
        challenge: {
          transaction: "AAAA",
          networkPassphrase: "Test SDF Network ; September 2015",
        },
      }).success,
      true
    );
  });

  it("AnchorStartResponseSchema rejects missing challenge", () => {
    assert.equal(
      AnchorStartResponseSchema.safeParse({
        session: {
          id: "s1",
          userId: "u1",
          anchorName: "TestAnchor",
          kind: "deposit",
          assetCode: "USDC",
          interactiveUrl: null,
          externalTransactionId: null,
          status: "incomplete",
          createdAt: "2026-01-01T00:00:00Z",
        },
      }).success,
      false
    );
  });

  it("AnchorSessionResponseSchema accepts valid session", () => {
    assert.equal(
      AnchorSessionResponseSchema.safeParse({
        session: {
          id: "s1",
          userId: "u1",
          anchorName: "TestAnchor",
          kind: "withdrawal" as const,
          assetCode: "XLM",
          interactiveUrl: null,
          externalTransactionId: null,
          status: "pending_anchor" as const,
          createdAt: "2026-01-01T00:00:00Z",
        },
      }).success,
      true
    );
  });

  it("AnchorSessionsResponseSchema accepts valid session list", () => {
    assert.equal(
      AnchorSessionsResponseSchema.safeParse({
        sessions: [
          {
            id: "s1",
            userId: "u1",
            anchorName: "TestAnchor",
            kind: "deposit" as const,
            assetCode: "USDC",
            interactiveUrl: null,
            externalTransactionId: null,
            status: "completed" as const,
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      }).success,
      true
    );
  });

  it("UploadResponseSchema accepts valid upload response", () => {
    assert.equal(
      UploadResponseSchema.safeParse({ id: "up1", url: "https://cdn.example.com/receipt.jpg" }).success,
      true
    );
  });

  it("UploadResponseSchema rejects missing url", () => {
    assert.equal(UploadResponseSchema.safeParse({ id: "up1" }).success, false);
  });

  it("TreasuryIntentResponseSchema rejects invalid direction in nested transaction", () => {
    assert.equal(
      TreasuryIntentResponseSchema.safeParse({
        treasuryTransaction: { ...treasuryTx, direction: "sideways" },
        xdr: "AAAA",
        networkPassphrase: "...",
      }).success,
      false
    );
  });

  it("AnchorSessionResponseSchema rejects unknown status", () => {
    assert.equal(
      AnchorSessionResponseSchema.safeParse({
        session: {
          id: "s1",
          userId: "u1",
          anchorName: "TestAnchor",
          kind: "deposit",
          assetCode: "USDC",
          interactiveUrl: null,
          externalTransactionId: null,
          status: "bogus",
          createdAt: "2026-01-01T00:00:00Z",
        },
      }).success,
      false
    );
  });
});
