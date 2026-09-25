import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OPTIMISTIC_EXPENSE_PREFIX,
  applyOptimisticSettlement,
  buildOptimisticExpense,
  insertOptimisticExpense,
  isOptimisticExpenseId,
  removeOptimisticExpense,
  shareAmountForRequest,
} from "../optimistic";
import type {
  BalancesResponse,
  CreateExpenseRequest,
  Expense,
  User,
} from "../types";

function user(overrides: Partial<User> = {}): User {
  return {
    id: "user-a",
    stellarPublicKey: "GABC",
    displayName: "Ada",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function request(overrides: Partial<CreateExpenseRequest> = {}): CreateExpenseRequest {
  return {
    title: "Dinner",
    amount: "100.0000000",
    assetCode: "XLM",
    splitType: "equal",
    shares: [{ userId: "user-a" }, { userId: "user-b" }],
    ...overrides,
  };
}

function expense(id: string): Expense {
  return {
    id,
    groupId: "grp-1",
    payerUserId: "user-a",
    payer: user(),
    title: id,
    description: null,
    amount: "10.0000000",
    assetCode: "XLM",
    assetIssuer: null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2024-05-01T12:00:00.000Z",
    shares: [],
  };
}

function balances(
  rows: { userId: string; net: string }[]
): BalancesResponse {
  return {
    balances: rows.map((r) => ({
      userId: r.userId,
      user: user({ id: r.userId }),
      net: r.net,
      assetCode: "XLM",
    })),
    suggestions: [],
  };
}

describe("shareAmountForRequest", () => {
  it("splits an equal expense evenly", () => {
    assert.equal(shareAmountForRequest(request(), 0), "50");
    assert.equal(shareAmountForRequest(request(), 1), "50");
  });

  it("rounds the equal split to 7 decimal places", () => {
    const r = request({ amount: "10", shares: [{ userId: "a" }, { userId: "b" }, { userId: "c" }] });
    assert.equal(shareAmountForRequest(r, 0), "3.3333333");
  });

  it("uses the explicit amount for a custom split", () => {
    const r = request({
      splitType: "custom",
      shares: [{ userId: "a", amount: "30.0000000" }, { userId: "b", amount: "70.0000000" }],
    });
    assert.equal(shareAmountForRequest(r, 0), "30");
    assert.equal(shareAmountForRequest(r, 1), "70");
  });

  it("applies the percentage for a percentage split", () => {
    const r = request({
      splitType: "percentage",
      shares: [{ userId: "a", percent: 25 }, { userId: "b", percent: 75 }],
    });
    assert.equal(shareAmountForRequest(r, 0), "25");
    assert.equal(shareAmountForRequest(r, 1), "75");
  });

  it("never produces NaN for missing or garbage inputs", () => {
    const r = request({ amount: "not-a-number", shares: [{ userId: "a" }] });
    assert.equal(shareAmountForRequest(r, 0), "0");
    assert.equal(shareAmountForRequest({ ...r, shares: [] }, 0), "0");
  });
});

describe("buildOptimisticExpense", () => {
  it("flags the expense as optimistic with pending shares", () => {
    const built = buildOptimisticExpense({
      groupId: "grp-1",
      request: request(),
      payer: user(),
      now: new Date("2024-05-01T12:00:00.000Z"),
    });

    assert.equal(built.isOptimistic, true);
    assert.ok(isOptimisticExpenseId(built.id));
    assert.ok(built.id.startsWith(OPTIMISTIC_EXPENSE_PREFIX));
    assert.equal(built.groupId, "grp-1");
    assert.equal(built.title, "Dinner");
    assert.equal(built.createdAt, "2024-05-01T12:00:00.000Z");
    assert.equal(built.shares.length, 2);
    assert.ok(built.shares.every((s) => s.status === "pending"));
    assert.equal(built.shares[0].shareAmount, "50");
    assert.equal(built.shares[0].expenseId, built.id);
  });

  it("falls back to the payer id when the request omits it", () => {
    const built = buildOptimisticExpense({
      groupId: "grp-1",
      request: request({ payerUserId: undefined }),
      payer: user({ id: "payer-7" }),
    });
    assert.equal(built.payerUserId, "payer-7");
  });

  it("resolves member profiles for share display names", () => {
    const built = buildOptimisticExpense({
      groupId: "grp-1",
      request: request(),
      payer: user(),
      resolveUser: (id) => (id === "user-b" ? user({ id, displayName: "Grace" }) : undefined),
    });
    assert.equal(built.shares[1].user.displayName, "Grace");
    // Unknown members still get a usable placeholder rather than a crash.
    assert.equal(built.shares[0].user.displayName, "Member");
  });

  it("mints a fresh id every call", () => {
    const a = buildOptimisticExpense({ groupId: "g", request: request(), payer: user() });
    const b = buildOptimisticExpense({ groupId: "g", request: request(), payer: user() });
    assert.notEqual(a.id, b.id);
  });
});

describe("insertOptimisticExpense", () => {
  const opt = buildOptimisticExpense({
    groupId: "grp-1",
    request: request(),
    payer: user(),
  });

  it("prepends to the plain { expenses } cache shape", () => {
    const next = insertOptimisticExpense({ expenses: [expense("e1")] }, opt);
    assert.deepEqual(
      next.expenses.map((e) => e.id),
      [opt.id, "e1"]
    );
  });

  it("prepends to the first page of an infinite cache", () => {
    const next = insertOptimisticExpense(
      {
        pages: [
          { expenses: [expense("e1")] },
          { expenses: [expense("e2")] },
        ],
        pageParams: [undefined],
      },
      opt
    );
    assert.equal(next.pages[0].expenses[0].id, opt.id);
    assert.equal(next.pages[1].expenses[0].id, "e2");
    assert.equal(next.pages.length, 2);
  });

  it("is idempotent for the same expense", () => {
    const once = insertOptimisticExpense({ expenses: [expense("e1")] }, opt);
    const twice = insertOptimisticExpense(once, opt);
    assert.equal(twice.expenses.length, 2);
  });

  it("leaves an empty or unknown cache untouched", () => {
    assert.equal(insertOptimisticExpense(undefined, opt), undefined);
    assert.deepEqual(insertOptimisticExpense({ something: 1 }, opt), { something: 1 });
    assert.deepEqual(insertOptimisticExpense([] as Expense[], opt)[0].id, opt.id);
  });
});

describe("removeOptimisticExpense", () => {
  const opt = buildOptimisticExpense({
    groupId: "grp-1",
    request: request(),
    payer: user(),
  });

  it("removes the entry from both cache shapes", () => {
    const plain = removeOptimisticExpense({ expenses: [opt, expense("e1")] }, opt.id);
    assert.deepEqual(
      plain.expenses.map((e) => e.id),
      ["e1"]
    );

    const paged = removeOptimisticExpense(
      { pages: [{ expenses: [opt, expense("e1")] }], pageParams: [] },
      opt.id
    );
    assert.deepEqual(
      paged.pages[0].expenses.map((e) => e.id),
      ["e1"]
    );
  });

  it("keeps server rows that merely look similar", () => {
    const kept = removeOptimisticExpense({ expenses: [expense("e1")] }, opt.id);
    assert.equal(kept.expenses.length, 1);
  });
});

describe("applyOptimisticSettlement", () => {
  it("raises the payer's net and lowers the payee's", () => {
    const next = applyOptimisticSettlement(
      balances([
        { userId: "user-a", net: "-10" },
        { userId: "user-b", net: "10" },
      ]),
      { fromUserId: "user-a", toUserId: "user-b", amount: "10.0000000" }
    );
    assert.equal(next.balances[0].net, "0");
    assert.equal(next.balances[1].net, "0");
  });

  it("partially settles when the amount is smaller than the debt", () => {
    const next = applyOptimisticSettlement(
      balances([{ userId: "user-a", net: "-15" }]),
      { fromUserId: "user-a", toUserId: "user-b", amount: "5.5" }
    );
    assert.equal(next.balances[0].net, "-9.5");
  });

  it("ignores members outside the transfer", () => {
    const before = balances([{ userId: "user-c", net: "3" }]);
    const next = applyOptimisticSettlement(before, {
      fromUserId: "user-a",
      toUserId: "user-b",
      amount: "4",
    });
    assert.equal(next.balances[0].net, "3");
  });

  it("returns the input untouched for zero, unparseable or empty payloads", () => {
    const before = balances([{ userId: "user-a", net: "-1" }]);
    assert.equal(
      applyOptimisticSettlement(before, {
        fromUserId: "user-a",
        toUserId: "user-b",
        amount: "0",
      }),
      before
    );
    assert.equal(
      applyOptimisticSettlement(before, {
        fromUserId: "user-a",
        toUserId: "user-b",
        amount: "nonsense",
      }),
      before
    );
    assert.equal(
      applyOptimisticSettlement(undefined as unknown as BalancesResponse, {
        fromUserId: "user-a",
        toUserId: "user-b",
        amount: "1",
      }),
      undefined
    );
  });

  it("only adjusts rows matching the settlement asset", () => {
    const mixed: BalancesResponse = {
      balances: [
        {
          userId: "user-a",
          user: user({ id: "user-a" }),
          net: "-10",
          assetCode: "XLM",
        },
        {
          userId: "user-a",
          user: user({ id: "user-a" }),
          net: "-4",
          assetCode: "USDC",
        },
      ],
      suggestions: [],
    };

    const next = applyOptimisticSettlement(mixed, {
      fromUserId: "user-a",
      toUserId: "user-b",
      amount: "4",
      assetCode: "USDC",
    });
    assert.equal(next.balances[0].net, "-10");
    assert.equal(next.balances[1].net, "0");

    const untouched = applyOptimisticSettlement(mixed, {
      fromUserId: "user-a",
      toUserId: "user-b",
      amount: "4",
      assetCode: "EURC",
    });
    assert.equal(untouched.balances[0].net, "-10");
    assert.equal(untouched.balances[1].net, "-4");
  });

  it("tolerates a cached payload with no balances array", () => {
    const legacy = { netBalances: [] } as unknown as BalancesResponse;
    assert.equal(
      applyOptimisticSettlement(legacy, {
        fromUserId: "user-a",
        toUserId: "user-b",
        amount: "1",
      }),
      legacy
    );
  });
});
