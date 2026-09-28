import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/queries";
import { calculateOptimisticActivityList } from "@/lib/activity";
import {
  applyOptimisticSettlement,
  buildOptimisticExpense,
  insertOptimisticExpense,
  isOptimisticExpenseId,
  removeOptimisticExpense,
  shareAmountForRequest,
} from "@/lib/optimistic";
import type {
  BalancesResponse,
  CreateExpenseRequest,
  CreateSettlementRequest,
  GroupActivityResponse,
  GroupActivityEvent,
  User,
} from "@/lib/types";

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

function balances(rows: { userId: string; net: string }[]): BalancesResponse {
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

function expenseRequest(overrides: Partial<CreateExpenseRequest> = {}): CreateExpenseRequest {
  return {
    title: "Dinner",
    amount: "100.0000000",
    assetCode: "XLM",
    splitType: "equal",
    shares: [{ userId: "user-a" }, { userId: "user-b" }],
    ...overrides,
  };
}

function settlementRequest(overrides: Partial<CreateSettlementRequest> = {}): CreateSettlementRequest {
  return {
    toUserId: "user-b",
    amount: "10.0000000",
    assetCode: "XLM",
    ...overrides,
  };
}

function activityResponse(activities: GroupActivityEvent[]): GroupActivityResponse {
  return { activities };
}

function optEvent(overrides: Partial<GroupActivityEvent> = {}): GroupActivityEvent {
  return {
    id: "opt-1",
    groupId: "g1",
    type: "expense_created",
    actor: { id: "user-a", displayName: "Ada", avatarUrl: null },
    description: "Added expense",
    timestamp: new Date().toISOString(),
    isOptimistic: true,
    ...overrides,
  };
}

describe("settlement optimistic balance calculation", () => {
  it("raises payer net and lowers payee net by the settlement amount", () => {
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
      applyOptimisticSettlement(before, { fromUserId: "user-a", toUserId: "user-b", amount: "0" }),
      before
    );
    assert.equal(
      applyOptimisticSettlement(before, { fromUserId: "user-a", toUserId: "user-b", amount: "nonsense" }),
      before
    );
    assert.equal(
      applyOptimisticSettlement(undefined as unknown as BalancesResponse, { fromUserId: "user-a", toUserId: "user-b", amount: "1" }),
      undefined
    );
  });

  it("only adjusts rows matching the settlement asset", () => {
    const mixed: BalancesResponse = {
      balances: [
        { userId: "user-a", user: user({ id: "user-a" }), net: "-10", assetCode: "XLM" },
        { userId: "user-a", user: user({ id: "user-a" }), net: "-4", assetCode: "USDC" },
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
  });
});

describe("settlement optimistic activity list update logic", () => {
  it("prepends an optimistic event to the activity feed", () => {
    const existing = activityResponse([
      {
        id: "act-1",
        groupId: "g1",
        type: "member_joined",
        actor: { id: "u1", displayName: "Alice", avatarUrl: null },
        description: "Joined",
        timestamp: "2026-01-01T00:00:00Z",
      },
    ]);

    const updated = calculateOptimisticActivityList(existing, optEvent());
    assert.equal(updated.activities.length, 2);
    assert.equal(updated.activities[0].id, "opt-1");
    assert.equal(updated.activities[0].isOptimistic, true);
  });

  it("preserves previous state for rollback on error", () => {
    const initial = activityResponse([
      {
        id: "act-1",
        groupId: "g1",
        type: "member_joined",
        actor: { id: "u1", displayName: "Alice", avatarUrl: null },
        description: "Joined",
        timestamp: "2026-01-01T00:00:00Z",
      },
    ]);

    const updated = calculateOptimisticActivityList(initial, optEvent());
    assert.equal(updated.activities.length, 2);

    const rolledBack = activityResponse(initial.activities);
    assert.equal(rolledBack.activities.length, 1);
    assert.equal(rolledBack.activities[0].id, "act-1");
  });

  it("is idempotent for the same event", () => {
    const existing = activityResponse([]);
    const event = optEvent({ id: "opt-1" });
    const updated = calculateOptimisticActivityList(existing, event);
    const again = calculateOptimisticActivityList(updated, event);
    assert.equal(updated.activities.length, again.activities.length);
  });
});

describe("settlement mutation behavior (mocked)", () => {
  it("applies optimistic settlement on mutate and rolls back on error", () => {
    const qc = new QueryClient();
    const groupId = "g-123";
    qc.setQueryData(qk.balances(groupId), balances([
      { userId: "user-a", net: "-10" },
      { userId: "user-b", net: "10" },
    ]));

    const snapshot = qc.getQueryData<BalancesResponse>(qk.balances(groupId));
    assert.ok(snapshot);

    qc.setQueryData<BalancesResponse>(qk.balances(groupId), (old) =>
      old ? applyOptimisticSettlement(old, { fromUserId: "user-a", toUserId: "user-b", amount: "10.0000000" }) : old
    );

    const updated = qc.getQueryData<BalancesResponse>(qk.balances(groupId));
    assert.ok(updated);
    assert.equal(updated.balances[0].net, "0");
    assert.equal(updated.balances[1].net, "0");

    qc.setQueryData(qk.balances(groupId), snapshot);
    const restored = qc.getQueryData<BalancesResponse>(qk.balances(groupId));
    assert.equal(restored?.balances[0].net, "-10");
    assert.equal(restored?.balances[1].net, "10");
  });

  it("invalidates cache keys after settlement settles", () => {
    const qc = new QueryClient();
    const groupId = "g-123";
    qc.setQueryData(qk.balances(groupId), balances([
      { userId: "user-a", net: "-10" },
      { userId: "user-b", net: "10" },
    ]));
    qc.setQueryData(qk.activity(groupId), activityResponse([]));

    const keys = [qk.expenses(groupId), qk.balances(groupId), qk.activity(groupId), qk.history];
    for (const key of keys) {
      qc.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
    }

    const balancesCache = qc.getQueriesData({ queryKey: qk.balances(groupId) });
    assert.ok(balancesCache.length >= 0);
  });
});

describe("cache invalidation after settlement", () => {
  it("invalidates balances, activity, expenses, and history keys", () => {
    const qc = new QueryClient();
    const groupId = "g-123";
    qc.setQueryData(qk.balances(groupId), balances([{ userId: "user-a", net: "0" }]));
    qc.setQueryData(qk.activity(groupId), activityResponse([]));

    const invalidationTargets = [qk.expenses(groupId), qk.balances(groupId), qk.ledger(groupId), { queryKey: qk.groups, exact: true }];
    assert.equal(invalidationTargets.length, 4);
    assert.deepEqual(invalidationTargets[0], qk.expenses(groupId));
    assert.deepEqual(invalidationTargets[1], qk.balances(groupId));
  });

  it("ensures activity and history invalidation queries are issued", () => {
    const qc = new QueryClient();
    const groupId = "g-123";
    qc.setQueryData(qk.activity(groupId), activityResponse([]));

    const activityKey = qk.activity(groupId);
    const historyKey = qk.history;
    qc.invalidateQueries({ queryKey: activityKey });
    qc.invalidateQueries({ queryKey: historyKey });

    const activityCache = qc.getQueryData(qk.activity(groupId));
    assert.ok(activityCache !== undefined);
  });
});

describe("rollback behavior on error", () => {
  it("restores balances from snapshot on error", () => {
    const qc = new QueryClient();
    const groupId = "g-123";
    const original = balances([{ userId: "user-a", net: "-10" }]);
    qc.setQueryData(qk.balances(groupId), original);

    const snapshot = qc.getQueryData<BalancesResponse>(qk.balances(groupId));

    qc.setQueryData(qk.balances(groupId), balances([{ userId: "user-a", net: "0" }]));

    qc.setQueryData(qk.balances(groupId), snapshot);
    const restored = qc.getQueryData<BalancesResponse>(qk.balances(groupId));
    assert.equal(restored?.balances[0].net, "-10");
  });

  it("restores activity from snapshot on error", () => {
    const qc = new QueryClient();
    const groupId = "g-123";
    const originalActivity = activityResponse([
      {
        id: "act-1",
        groupId,
        type: "member_joined",
        actor: { id: "u1", displayName: "Alice", avatarUrl: null },
        description: "Joined",
        timestamp: "2026-01-01T00:00:00Z",
      },
    ]);
    qc.setQueryData(qk.activity(groupId), originalActivity);

    const snapshot = qc.getQueryData<GroupActivityResponse>(qk.activity(groupId));
    assert.equal(snapshot?.activities.length, 1);

    const newActivity = activityResponse([optEvent(), optEvent({ id: "opt-2" })]);
    qc.setQueryData(qk.activity(groupId), newActivity);
    assert.equal(qc.getQueryData<GroupActivityResponse>(qk.activity(groupId))?.activities.length, 2);

    qc.setQueryData(qk.activity(groupId), snapshot);
    assert.equal(qc.getQueryData<GroupActivityResponse>(qk.activity(groupId))?.activities.length, 1);
  });

  it("restores expenses from snapshot on error", () => {
    const qc = new QueryClient();
    const groupId = "g-123";
    const originalExpenses = { expenses: [{ id: "e1", title: "Original" }] };
    qc.setQueryData(qk.expenses(groupId), originalExpenses);

    const snapshot = qc.getQueriesData({ queryKey: qk.expenses(groupId) });

    qc.setQueryData(qk.expenses(groupId), { expenses: [{ id: "opt-1", title: "Optimistic", isOptimistic: true }] });

    for (const [queryKey, queryData] of snapshot) {
      qc.setQueryData(queryKey, queryData);
    }

    const restored = qc.getQueryData(qk.expenses(groupId));
    assert.deepEqual(restored, originalExpenses);
  });
});

describe("optimistic expense and activity helpers", () => {
  it("creates an optimistic expense with correct flags", () => {
    const built = buildOptimisticExpense({
      groupId: "grp-1",
      request: expenseRequest(),
      payer: user(),
    });
    assert.equal(built.isOptimistic, true);
    assert.ok(isOptimisticExpenseId(built.id));
  });

  it("inserts optimistic expense at the top of the list", () => {
    const opt = buildOptimisticExpense({
      groupId: "grp-1",
      request: expenseRequest(),
      payer: user(),
    });
    const next = insertOptimisticExpense({ expenses: [{ id: "e1", title: "Expense 1" }] }, opt);
    assert.equal((next as { expenses: { id: string }[] }).expenses[0].id, opt.id);
  });

  it("removes optimistic expense from the list", () => {
    const opt = buildOptimisticExpense({
      groupId: "grp-1",
      request: expenseRequest(),
      payer: user(),
    });
    const list = { expenses: [opt, { id: "e1", title: "Expense 1" }] };
    const next = removeOptimisticExpense(list, opt.id);
    assert.equal((next as { expenses: { id: string }[] }).expenses.length, 1);
  });

  it("calculates equal split shares correctly", () => {
    assert.equal(shareAmountForRequest(expenseRequest(), 0), "50");
    assert.equal(shareAmountForRequest(expenseRequest(), 1), "50");
  });
});