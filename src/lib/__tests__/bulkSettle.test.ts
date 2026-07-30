import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  estimateBulkFee,
  filterUnsettledShares,
  sumSelectedAmounts,
  validateSameRecipient,
  buildBulkTarget,
  type UnsettledShare,
} from "../bulkSettle";
import type { Expense, ExpenseShare, User } from "../types";

function user(id: string, displayName: string): User {
  return {
    id,
    displayName,
    stellarPublicKey: `G${id}TEST`,
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

const alice = user("user-alice", "Alice");
const bob = user("user-bob", "Bob");
const charlie = user("user-charlie", "Charlie");

type ShareInput = Partial<ExpenseShare> & {
  userId: string;
  status: ExpenseShare["status"];
  shareAmount: string;
};

function share(s: ShareInput): ExpenseShare {
  return {
    id: `share-${s.userId}-${Math.random()}`,
    expenseId: "expense-x",
    user:
      s.userId === alice.id
        ? alice
        : s.userId === bob.id
          ? bob
          : charlie,
    shareAmount: s.shareAmount,
    status: s.status,
    userId: s.userId,
  };
}

function expense(opts: {
  id: string;
  title?: string;
  payerUserId: string;
  payer?: User;
  assetCode?: string;
  assetIssuer?: string | null;
  shares: ExpenseShare[];
}): Expense {
  const payer =
    opts.payer ??
    (opts.payerUserId === alice.id
      ? alice
      : opts.payerUserId === bob.id
        ? bob
        : charlie);
  return {
    id: opts.id,
    groupId: "group-1",
    payerUserId: opts.payerUserId,
    payer,
    title: opts.title ?? opts.id,
    description: null,
    amount: "100.0000000",
    assetCode: opts.assetCode ?? "XLM",
    assetIssuer: opts.assetIssuer ?? null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2026-01-01T00:00:00Z",
    shares: opts.shares,
  };
}

function bulkExpense(opts: {
  id: string;
  payer: User;
  assetCode?: string;
  assetIssuer?: string | null;
  amount: string;
  myShare: string;
  myStatus: ExpenseShare["status"];
  payerShareStatus?: ExpenseShare["status"];
  payerShareAmount?: string;
}): Expense {
  return expense({
    id: opts.id,
    payerUserId: opts.payer.id,
    payer: opts.payer,
    assetCode: opts.assetCode,
    assetIssuer: opts.assetIssuer,
    shares: [
      share({
        userId: opts.payer.id,
        shareAmount: opts.payerShareAmount ?? opts.amount,
        status: opts.payerShareStatus ?? "pending",
      }),
      share({
        userId: alice.id,
        shareAmount: opts.myShare,
        status: opts.myStatus,
      }),
    ],
  });
}

describe("filterUnsettledShares", () => {
  it("returns shares the current user owes on a non-self-paid expense", () => {
    const expenses: Expense[] = [
      bulkExpense({
        id: "exp-1",
        payer: bob,
        amount: "100.0000000",
        myShare: "50.0000000",
        myStatus: "pending",
      }),
    ];
    const result = filterUnsettledShares(expenses, alice.id);
    assert.strictEqual(result.length, 1);
    // Subset match (toMatchObject equivalent): extract only the fields the
    // original assertion checked so deepStrictEqual holds even though
    // UnsettledShare has more fields.
    assert.deepStrictEqual(
      {
        expenseId: result[0].expenseId,
        payerUserId: result[0].payerUserId,
        payer: result[0].payer,
        amount: result[0].amount,
      },
      { expenseId: "exp-1", payerUserId: bob.id, payer: bob, amount: "50.0000000" }
    );
  });

  it("excludes expenses where the current user is the payer", () => {
    const expenses: Expense[] = [
      bulkExpense({
        id: "self-paid",
        payer: alice,
        amount: "100.0000000",
        myShare: "50.0000000",
        myStatus: "pending",
      }),
    ];
    assert.deepStrictEqual(filterUnsettledShares(expenses, alice.id), []);
  });

  it("excludes already-settled shares", () => {
    const expenses: Expense[] = [
      bulkExpense({
        id: "exp-1",
        payer: bob,
        amount: "100.0000000",
        myShare: "50.0000000",
        myStatus: "settled",
      }),
      bulkExpense({
        id: "exp-2",
        payer: bob,
        amount: "100.0000000",
        myShare: "30.0000000",
        myStatus: "pending",
      }),
    ];
    const result = filterUnsettledShares(expenses, alice.id);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].expenseId, "exp-2");
  });

  it("excludes expenses with no share for the current user", () => {
    const expenses: Expense[] = [
      expense({
        id: "no-share",
        payerUserId: bob.id,
        shares: [
          share({
            userId: bob.id,
            shareAmount: "100.0000000",
            status: "pending",
          }),
          share({
            userId: charlie.id,
            shareAmount: "100.0000000",
            status: "pending",
          }),
        ],
      }),
    ];
    assert.deepStrictEqual(filterUnsettledShares(expenses, alice.id), []);
  });

  it("treats 'settling' status as still unsettleable", () => {
    const expenses: Expense[] = [
      bulkExpense({
        id: "exp-1",
        payer: bob,
        amount: "100.0000000",
        myShare: "50.0000000",
        myStatus: "settling",
      }),
    ];
    assert.strictEqual(filterUnsettledShares(expenses, alice.id).length, 1);
  });
});

describe("validateSameRecipient", () => {
  function makeShare(payerUserId: string): UnsettledShare {
    return {
      expenseId: `e-${payerUserId}-${Math.random()}`,
      expenseTitle: `t-${payerUserId}`,
      payerUserId,
      payer:
        payerUserId === alice.id
          ? alice
          : payerUserId === bob.id
            ? bob
            : charlie,
      amount: "1.0000000",
      assetCode: "XLM",
      assetIssuer: null,
    };
  }

  it("returns null when all selected shares go to the same recipient", () => {
    const selected = [
      makeShare(bob.id),
      makeShare(bob.id),
      makeShare(bob.id),
    ];
    assert.strictEqual(validateSameRecipient(selected), null);
  });

  it("rejects with mismatched_recipient when payers differ", () => {
    const selected = [makeShare(bob.id), makeShare(charlie.id)];
    const err = validateSameRecipient(selected);
    assert.ok(err !== null);
    assert.strictEqual(err?.code, "mismatched_recipient");
    assert.match(err?.message ?? "", /same recipient/i);
  });

  it("rejects with no_selection when selection is empty", () => {
    const err = validateSameRecipient([]);
    assert.strictEqual(err?.code, "no_selection");
  });
});

describe("sumSelectedAmounts", () => {
  function makeShare(amount: string): UnsettledShare {
    return {
      expenseId: `e-${Math.random()}`,
      expenseTitle: "t",
      payerUserId: bob.id,
      payer: bob,
      amount,
      assetCode: "XLM",
      assetIssuer: null,
    };
  }

  it("sums integer stroops exactly with no rounding", () => {
    assert.strictEqual(
      sumSelectedAmounts([
        makeShare("33.3333333"),
        makeShare("33.3333333"),
        makeShare("33.3333334"),
      ]),
      "100.0000000"
    );
  });

  it("returns 0.0000000 for an empty selection", () => {
    assert.strictEqual(sumSelectedAmounts([]), "0.0000000");
  });

  it("handles a single share", () => {
    assert.strictEqual(sumSelectedAmounts([makeShare("42.5000000")]), "42.5000000");
  });
});

describe("estimateBulkFee", () => {
  it("adds 100 stroops for envelope + 100 stroops per payment", () => {
    // 1 op → 200 stroops
    assert.strictEqual(estimateBulkFee(1), "0.0000200");
    // 5 ops → 600 stroops
    assert.strictEqual(estimateBulkFee(5), "0.0000600");
    // 0 ops → clamped to 1
    assert.strictEqual(estimateBulkFee(0), "0.0000200");
  });
});

describe("buildBulkTarget", () => {
  function makeShare(
    payerUserId: string,
    amount: string,
    id: string
  ): UnsettledShare {
    return {
      expenseId: id,
      expenseTitle: id,
      payerUserId,
      payer:
        payerUserId === alice.id
          ? alice
          : payerUserId === bob.id
            ? bob
            : charlie,
      amount,
      assetCode: "XLM",
      assetIssuer: null,
    };
  }

  it("returns null target with mismatched_recipient on mixed selection", () => {
    const selected = [
      makeShare(bob.id, "10.0000000", "e1"),
      makeShare(charlie.id, "20.0000000", "e2"),
    ];
    const { target, error } = buildBulkTarget(selected);
    assert.strictEqual(target, null);
    assert.strictEqual(error?.code, "mismatched_recipient");
  });

  it("returns a valid BulkSettleTarget when selection is uniform", () => {
    const selected = [
      makeShare(bob.id, "10.5000000", "e1"),
      makeShare(bob.id, "5.2500000", "e2"),
    ];
    const { target, error } = buildBulkTarget(selected);
    assert.strictEqual(error, null);
    assert.ok(target !== null);
    assert.deepStrictEqual(target?.expenseIds, ["e1", "e2"]);
    assert.strictEqual(target?.amount, "15.7500000");
    assert.strictEqual(target?.to.displayName, "Bob");
  });
});
