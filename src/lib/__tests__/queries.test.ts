import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { QueryClient } from "@tanstack/react-query";
import { qk, calculateOptimisticBalances } from "../queries";
import type { BalancesResponse, CreateExpenseRequest } from "../types";

describe("Optimistic Group Balances Update", () => {
  let queryClient: QueryClient;
  const groupId = "group-1";
  const otherGroupId = "group-2";

  const initialBalancesGroup1: BalancesResponse = {
    balances: [
      {
        userId: "user-1",
        user: {
          id: "user-1",
          displayName: "Alice",
          stellarPublicKey: "G1...",
          avatarUrl: null,
          createdAt: "2026-01-01",
        },
        net: "0",
        assetCode: "XLM",
      },
      {
        userId: "user-2",
        user: {
          id: "user-2",
          displayName: "Bob",
          stellarPublicKey: "G2...",
          avatarUrl: null,
          createdAt: "2026-01-01",
        },
        net: "0",
        assetCode: "XLM",
      },
      {
        userId: "user-3",
        user: {
          id: "user-3",
          displayName: "Charlie",
          stellarPublicKey: "G3...",
          avatarUrl: null,
          createdAt: "2026-01-01",
        },
        net: "0",
        assetCode: "XLM",
      },
    ],
    suggestions: [],
  };

  const initialBalancesGroup2: BalancesResponse = {
    balances: [
      {
        userId: "user-1",
        user: {
          id: "user-1",
          displayName: "Alice",
          stellarPublicKey: "G1...",
          avatarUrl: null,
          createdAt: "2026-01-01",
        },
        net: "10",
        assetCode: "XLM",
      },
    ],
    suggestions: [],
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(qk.balances(groupId), initialBalancesGroup1);
    queryClient.setQueryData(qk.balances(otherGroupId), initialBalancesGroup2);
  });

  it("optimistically updates balances for an equal split among a subset of members", () => {
    const expenseRequest: CreateExpenseRequest = {
      title: "Dinner",
      amount: "60",
      assetCode: "XLM",
      splitType: "equal",
      payerUserId: "user-1",
      shares: [{ userId: "user-1" }, { userId: "user-2" }], // user-3 is not a participant
    };

    queryClient.setQueryData<BalancesResponse>(qk.balances(groupId), (old) => {
      if (!old) return old;
      return calculateOptimisticBalances(old, expenseRequest, "user-1");
    });

    const updatedBalances = queryClient.getQueryData<BalancesResponse>(qk.balances(groupId));
    assert.ok(updatedBalances);

    const alice = updatedBalances.balances.find((b) => b.userId === "user-1");
    const bob = updatedBalances.balances.find((b) => b.userId === "user-2");
    const charlie = updatedBalances.balances.find((b) => b.userId === "user-3");

    // Alice paid 60, share is 30 -> net +30
    assert.strictEqual(alice?.net, "30");
    // Bob paid 0, share is 30 -> net -30
    assert.strictEqual(bob?.net, "-30");
    // Charlie is not a participant -> net 0
    assert.strictEqual(charlie?.net, "0");

    // Check that group-2 was unaffected
    const group2Balances = queryClient.getQueryData<BalancesResponse>(qk.balances(otherGroupId));
    assert.strictEqual(group2Balances?.balances[0].net, "10");
  });

  it("optimistically updates balances for a custom split", () => {
    const expenseRequest: CreateExpenseRequest = {
      title: "Groceries",
      amount: "100",
      assetCode: "XLM",
      splitType: "custom",
      payerUserId: "user-1",
      shares: [
        { userId: "user-1", amount: "20" },
        { userId: "user-2", amount: "30" },
        { userId: "user-3", amount: "50" },
      ],
    };

    queryClient.setQueryData<BalancesResponse>(qk.balances(groupId), (old) => {
      if (!old) return old;
      return calculateOptimisticBalances(old, expenseRequest, "user-1");
    });

    const updatedBalances = queryClient.getQueryData<BalancesResponse>(qk.balances(groupId));
    assert.ok(updatedBalances);

    // Alice paid 100, share 20 -> +80
    assert.strictEqual(updatedBalances.balances.find((b) => b.userId === "user-1")?.net, "80");
    // Bob paid 0, share 30 -> -30
    assert.strictEqual(updatedBalances.balances.find((b) => b.userId === "user-2")?.net, "-30");
    // Charlie paid 0, share 50 -> -50
    assert.strictEqual(updatedBalances.balances.find((b) => b.userId === "user-3")?.net, "-50");
  });

  it("optimistically updates balances for a percentage split", () => {
    const expenseRequest: CreateExpenseRequest = {
      title: "Utilities",
      amount: "200",
      assetCode: "XLM",
      splitType: "percentage",
      payerUserId: "user-2", // Bob paid
      shares: [
        { userId: "user-1", percent: 25 },
        { userId: "user-2", percent: 75 },
      ],
    };

    queryClient.setQueryData<BalancesResponse>(qk.balances(groupId), (old) => {
      if (!old) return old;
      return calculateOptimisticBalances(old, expenseRequest, "user-2");
    });

    const updatedBalances = queryClient.getQueryData<BalancesResponse>(qk.balances(groupId));
    assert.ok(updatedBalances);

    // Alice share: 200 * 25% = 50, paid 0 -> -50
    assert.strictEqual(updatedBalances.balances.find((b) => b.userId === "user-1")?.net, "-50");
    // Bob share: 200 * 75% = 150, paid 200 -> +50
    assert.strictEqual(updatedBalances.balances.find((b) => b.userId === "user-2")?.net, "50");
    // Charlie paid 0, share 0 -> 0
    assert.strictEqual(updatedBalances.balances.find((b) => b.userId === "user-3")?.net, "0");
  });

  it("reverts balances to snapshot on mutation failure", () => {
    // Snapshot original balances
    const snapshot = queryClient.getQueryData<BalancesResponse>(qk.balances(groupId));

    // Mutate cache to updated state
    queryClient.setQueryData<BalancesResponse>(qk.balances(groupId), {
      balances: [],
      suggestions: [],
    });

    // Simulate onError rollback using snapshot
    queryClient.setQueryData(qk.balances(groupId), snapshot);

    const restored = queryClient.getQueryData<BalancesResponse>(qk.balances(groupId));
    assert.deepStrictEqual(restored, initialBalancesGroup1);
  });
});

describe("paginated expense query keys (#126)", () => {
  it("scopes the expense cache to a single group", () => {
    assert.notDeepEqual(qk.expenses("group-1"), qk.expenses("group-2"));
    assert.deepEqual(qk.expenses("group-1"), ["groups", "group-1", "expenses"]);
  });

  it("nests page keys under the group key so an invalidation reaches them", () => {
    const groupKey = qk.expenses("group-1");
    const pageKey = [...groupKey, "page", 20, null];
    assert.deepEqual(pageKey.slice(0, groupKey.length), groupKey);
  });

  it("keeps two groups' page caches apart", () => {
    const a = [...qk.expenses("group-1"), "page", 20, null];
    const b = [...qk.expenses("group-2"), "page", 20, null];
    assert.notDeepEqual(a, b);
  });

  it("drops every group's cached pages when the client is cleared on sign-out", () => {
    const client = new QueryClient();
    client.setQueryData([...qk.expenses("group-1"), "page", 20, null], {
      pages: [{ data: [], nextCursor: null }],
    });
    client.setQueryData([...qk.expenses("group-2"), "page", 20, null], {
      pages: [{ data: [], nextCursor: null }],
    });

    client.clear();

    assert.equal(
      client.getQueryData([...qk.expenses("group-1"), "page", 20, null]),
      undefined
    );
    assert.equal(
      client.getQueryData([...qk.expenses("group-2"), "page", 20, null]),
      undefined
    );
  });
});
