import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  aggregateBalancesByAsset,
} from "../balanceAggregation";
import {
  assetIdentityKey,
  recalculateGroupBalances,
} from "../utils/balance";
import {
  isValidMergepayMemo,
  validateMergepayMemo,
  validateSettlementMemo,
} from "../validations/memo";
import { isSettlementMemo, verifySettlementEnvelope } from "../stellar/transactions";
import type { Expense, ExpenseShare, MemberBalance, Settlement, User } from "../types";

const CREATED_AT = "2026-01-01T00:00:00.000Z";

function user(id: string): User {
  return {
    id,
    stellarPublicKey: `G${id.toUpperCase()}`,
    displayName: id,
    avatarUrl: null,
    createdAt: CREATED_AT,
  };
}

interface ShareInput {
  userId: string;
  shareAmount: string;
  status?: ExpenseShare["status"];
}

function expense(
  id: string,
  amount: string,
  payerUserId: string,
  shares: readonly ShareInput[],
  assetCode = "XLM",
  assetIssuer: string | null = null
): Expense {
  return {
    id,
    groupId: "group-1",
    payerUserId,
    payer: user(payerUserId),
    title: id,
    description: null,
    amount,
    assetCode,
    assetIssuer,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: CREATED_AT,
    shares: shares.map((share, index) => ({
      id: `${id}-share-${index}`,
      expenseId: id,
      userId: share.userId,
      user: user(share.userId),
      shareAmount: share.shareAmount,
      status: share.status ?? (share.userId === payerUserId ? "settled" : "pending"),
    })),
  };
}

function settlement(
  id: string,
  amount: string,
  fromUserId: string,
  toUserId: string,
  status: Settlement["status"] = "confirmed",
  assetCode = "XLM",
  assetIssuer: string | null = null
): Settlement {
  return {
    id,
    groupId: "group-1",
    fromUserId,
    from: user(fromUserId),
    toUserId,
    to: user(toUserId),
    amount,
    assetCode,
    assetIssuer,
    stellarTxHash: status === "confirmed" ? `tx-${id}` : null,
    status,
    memo: "MP:settle-1",
    expenseId: null,
    createdAt: CREATED_AT,
  };
}

function netFor(
  balances: ReturnType<typeof recalculateGroupBalances>,
  userId: string,
  assetCode: string,
  assetIssuer: string | null = null
): string {
  const balance = balances.find(
    (row) =>
      row.userId === userId &&
      row.assetCode === assetCode &&
      row.assetIssuer === assetIssuer
  );
  if (!balance) throw new Error(`No ${assetCode} balance for ${userId}.`);
  return balance.net;
}

function memberBalance(
  userId: string,
  net: string,
  assetCode: string,
  assetIssuer: string | null
): MemberBalance {
  return { userId, user: user(userId), net, assetCode, assetIssuer };
}

describe("recalculateGroupBalances", () => {
  it("nets multiple expenses in one asset and applies a confirmed settlement", () => {
    const result = recalculateGroupBalances(
      [
        expense("dinner", "30", "alice", [
          { userId: "alice", shareAmount: "10", status: "settled" },
          { userId: "bob", shareAmount: "10" },
          { userId: "carol", shareAmount: "10" },
        ]),
        expense("taxi", "9", "bob", [
          { userId: "bob", shareAmount: "3", status: "settled" },
          { userId: "alice", shareAmount: "3" },
          { userId: "carol", shareAmount: "3" },
        ]),
      ],
      [settlement("bob-pays-alice", "4", "bob", "alice")]
    );

    assert.equal(netFor(result, "alice", "XLM"), "13");
    assert.equal(netFor(result, "bob", "XLM"), "0");
    assert.equal(netFor(result, "carol", "XLM"), "-13");
    assert.ok(result.every((row) => row.assetIssuer === null));
  });

  it("keeps native XLM and issued USDC in separate asset balances", () => {
    const issuer = "GUSDCISSUER";
    const result = recalculateGroupBalances(
      [
        expense("xlm-meal", "10", "alice", [
          { userId: "alice", shareAmount: "3", status: "settled" },
          { userId: "bob", shareAmount: "7" },
        ]),
        expense(
          "usdc-hotel",
          "5",
          "alice",
          [
            { userId: "alice", shareAmount: "1", status: "settled" },
            { userId: "bob", shareAmount: "4" },
          ],
          "USDC",
          issuer
        ),
      ],
      []
    );

    assert.equal(netFor(result, "alice", "XLM"), "7");
    assert.equal(netFor(result, "bob", "XLM"), "-7");
    assert.equal(netFor(result, "alice", "USDC", issuer), "4");
    assert.equal(netFor(result, "bob", "USDC", issuer), "-4");
  });

  it("does not merge the same asset code when issuers differ", () => {
    const issuerOne = "GISSUERONE";
    const issuerTwo = "GISSUERTWO";
    const result = recalculateGroupBalances(
      [
        expense("token-one", "3", "alice", [{ userId: "bob", shareAmount: "3" }], "USDC", issuerOne),
        expense("token-two", "5", "alice", [{ userId: "bob", shareAmount: "5" }], "USDC", issuerTwo),
      ],
      []
    );

    assert.equal(result.length, 4);
    assert.equal(netFor(result, "alice", "USDC", issuerOne), "3");
    assert.equal(netFor(result, "alice", "USDC", issuerTwo), "5");
    assert.notEqual(assetIdentityKey("USDC", issuerOne), assetIdentityKey("USDC", issuerTwo));
  });

  it("counts pending and settling shares but excludes settled shares", () => {
    const result = recalculateGroupBalances(
      [
        expense("status-check", "6", "alice", [
          { userId: "alice", shareAmount: "1", status: "settled" },
          { userId: "bob", shareAmount: "2", status: "settling" },
          { userId: "carol", shareAmount: "3", status: "settled" },
        ]),
      ],
      []
    );

    assert.equal(netFor(result, "alice", "XLM"), "2");
    assert.equal(netFor(result, "bob", "XLM"), "-2");
    assert.equal(result.some((row) => row.userId === "carol"), false);
  });

  it("only applies confirmed settlements", () => {
    const result = recalculateGroupBalances(
      [expense("unpaid", "10", "alice", [{ userId: "bob", shareAmount: "10" }])],
      [
        settlement("confirmed", "2", "bob", "alice", "confirmed"),
        settlement("pending", "4", "bob", "alice", "pending"),
        settlement("failed", "3", "bob", "alice", "failed"),
      ]
    );

    assert.equal(netFor(result, "alice", "XLM"), "8");
    assert.equal(netFor(result, "bob", "XLM"), "-8");
  });

  it("sums decimal inputs exactly without binary floating-point drift", () => {
    const result = recalculateGroupBalances(
      [
        expense("one-tenth", "0.1", "alice", [{ userId: "bob", shareAmount: "0.1" }]),
        expense("two-tenths", "0.2", "alice", [{ userId: "bob", shareAmount: "0.2" }]),
      ],
      []
    );

    assert.equal(netFor(result, "alice", "XLM"), "0.3");
    assert.equal(netFor(result, "bob", "XLM"), "-0.3");
    assert.equal(result.find((row) => row.userId === "alice")?.netStroops, 3_000_000n);
  });

  it("keeps seven-decimal precision and accepts only extra trailing zeroes", () => {
    const result = recalculateGroupBalances(
      [expense("precision", "1.230000000", "alice", [{ userId: "bob", shareAmount: "1.230000000" }])],
      []
    );

    assert.equal(netFor(result, "alice", "XLM"), "1.23");
    assert.throws(
      () => recalculateGroupBalances(
        [expense("too-precise", "0.00000009", "alice", [{ userId: "bob", shareAmount: "0.00000009" }])],
        []
      ),
      /7-decimal precision/
    );
  });

  it("handles large valid amounts with exact integer arithmetic", () => {
    const amount = "922337203685.4775807";
    const result = recalculateGroupBalances(
      [expense("large", amount, "alice", [{ userId: "bob", shareAmount: amount }])],
      []
    );

    assert.equal(netFor(result, "alice", "XLM"), amount);
    assert.equal(netFor(result, "bob", "XLM"), `-${amount}`);
  });

  it("preserves explicit zero balances and returns an empty result for empty input", () => {
    assert.deepEqual(recalculateGroupBalances([], []), []);
    const result = recalculateGroupBalances(
      [
        expense("zero", "0", "alice", [
          { userId: "alice", shareAmount: "0", status: "settled" },
          { userId: "bob", shareAmount: "0" },
        ]),
      ],
      []
    );
    assert.equal(netFor(result, "alice", "XLM"), "0");
    assert.equal(netFor(result, "bob", "XLM"), "0");
  });

  it("rejects malformed amounts and inconsistent split totals instead of skipping them", () => {
    assert.throws(
      () => recalculateGroupBalances(
        [expense("malformed", "not-money", "alice", [{ userId: "bob", shareAmount: "1" }])],
        []
      ),
      /plain decimal amount/
    );
    assert.throws(
      () => recalculateGroupBalances(
        [expense("bad-split", "5", "alice", [{ userId: "bob", shareAmount: "4" }])],
        []
      ),
      /do not sum/
    );
    assert.throws(
      () => recalculateGroupBalances([], [settlement("malformed-settlement", "NaN", "bob", "alice")]),
      /plain decimal amount/
    );
    assert.throws(
      () =>
        recalculateGroupBalances(
          [expense("unknown-issuer", "1", "alice", [{ userId: "bob", shareAmount: "1" }], "USDC")],
          []
        ),
      /must include its issuer/
    );
  });
});

describe("asset-aware aggregation", () => {
  it("keeps API balance rows with different issuers in separate groups", () => {
    const rows = aggregateBalancesByAsset([
      memberBalance("alice", "1", "USDC", "GISSUERONE"),
      memberBalance("bob", "2", "USDC", "GISSUERTWO"),
    ]);

    assert.equal(rows.size, 2);
    assert.equal(rows.get(assetIdentityKey("USDC", "GISSUERONE"))?.net, "1");
    assert.equal(rows.get(assetIdentityKey("USDC", "GISSUERTWO"))?.net, "2");
  });
});

describe("settlement memo validation", () => {
  it("accepts valid MP codes and codes at the Stellar text memo limit", () => {
    assert.equal(validateSettlementMemo("MP:AB_01-x").valid, true);
    assert.equal(isSettlementMemo("MP:AB_01-x"), true);
    assert.equal(validateSettlementMemo(`MP:${"a".repeat(25)}`).valid, true);
  });

  it("rejects empty, missing-prefix, malformed, and overlong settlement memos", () => {
    const invalid = [
      "",
      "   ",
      "dinner-1a2b",
      "XP:dinner-1a2b",
      "MP:",
      "MP::code",
      "MP:code:extra",
      "MP:code with spaces",
      "MP:code\n",
      `MP:${"a".repeat(26)}`,
      "MP:café",
    ];

    for (const memo of invalid) {
      assert.equal(validateSettlementMemo(memo).valid, false, memo);
      assert.equal(isSettlementMemo(memo), false, memo);
    }
  });

  it("trims pasted whitespace for optional input validation but rejects it for signing", () => {
    assert.equal(validateMergepayMemo("  MP:dinner-1a2b\n").valid, true);
    assert.equal(isValidMergepayMemo("MP:dinner-1a2b"), true);
    assert.equal(validateSettlementMemo("  MP:dinner-1a2b").valid, false);
    assert.equal(validateSettlementMemo("MP:dinner-1a2b ").valid, false);
  });

  it("rejects a non-canonical memo in the envelope verification used before signing", () => {
    assert.throws(
      () =>
        verifySettlementEnvelope(
          {
            source: null,
            memoType: "text",
            memo: "MP:dinner-1a2b ",
            payments: [],
          },
          { memo: "MP:dinner-1a2b" }
        ),
      /valid MP:/
    );
  });
});
