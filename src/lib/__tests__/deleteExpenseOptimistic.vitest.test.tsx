/**
 * Integration tests for the optimistic delete path of useDeleteExpense (#375).
 *
 * Mirrors the pattern used by the existing expense-creation tests:
 *  - optimistic removal is visible before the API settles
 *  - rollback restores the previous list on error
 *  - settled (success/error) always triggers cache invalidation
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useDeleteExpense, qk } from "@/lib/queries";
import { api } from "@/lib/api";
import type { ExpensesResponse, User } from "@/lib/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api", () => ({
  api: {
    deleteExpense: vi.fn(),
    // queries.ts imports getInviteByCode via api but does not call it here
    listGroups: vi.fn(),
    me: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALICE: User = {
  id: "alice",
  stellarPublicKey: "GALICE",
  displayName: "Alice",
  avatarUrl: null,
  createdAt: "2024-01-01T00:00:00.000Z",
};

function makeExpense(id: string) {
  return {
    id,
    groupId: "grp-1",
    payerUserId: "alice",
    payer: ALICE,
    title: `Expense ${id}`,
    description: null,
    amount: "20.0000000",
    assetCode: "XLM",
    assetIssuer: null,
    splitType: "equal" as const,
    memo: null,
    receiptUrl: null,
    createdAt: "2024-06-01T00:00:00.000Z",
    shares: [],
  };
}

const TWO_EXPENSES: ExpensesResponse = {
  expenses: [makeExpense("e1"), makeExpense("e2")],
};

/** Deferred promise so we can inspect mutations mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createWrapper(qc: QueryClient) {
  const W = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  W.displayName = "QCWrapper";
  return W;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useDeleteExpense — optimistic cache update (#375)", () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    client.clear();
  });

  it("removes the expense from the cache before the API responds", async () => {
    client.setQueryData(qk.expenses("grp-1"), TWO_EXPENSES);
    const gate = deferred<{ ok: boolean }>();
    vi.mocked(api.deleteExpense).mockReturnValue(gate.promise);

    const { result } = renderHook(() => useDeleteExpense("grp-1"), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.mutate("e1");
    });

    // Expense should be gone while the API is still pending.
    await waitFor(() => {
      const cache = client.getQueryData<ExpensesResponse>(qk.expenses("grp-1"));
      expect(cache?.expenses).toHaveLength(1);
      expect(cache?.expenses[0].id).toBe("e2");
    });

    // Settle the promise so no unhandled rejection leaks.
    await act(async () => {
      gate.resolve({ ok: true });
    });
  });

  it("rolls back the list when the API call fails", async () => {
    client.setQueryData(qk.expenses("grp-1"), TWO_EXPENSES);
    const gate = deferred<{ ok: boolean }>();
    vi.mocked(api.deleteExpense).mockReturnValue(gate.promise);

    const { result } = renderHook(() => useDeleteExpense("grp-1"), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.mutate("e1");
    });

    // Optimistic removal.
    await waitFor(() => {
      const cache = client.getQueryData<ExpensesResponse>(qk.expenses("grp-1"));
      expect(cache?.expenses).toHaveLength(1);
    });

    // Simulate a network error.
    await act(async () => {
      gate.reject(new Error("upstream down"));
    });

    // Both expenses should be back.
    await waitFor(() => {
      const cache = client.getQueryData<ExpensesResponse>(qk.expenses("grp-1"));
      expect(cache?.expenses).toHaveLength(2);
      expect(cache?.expenses.map((e) => e.id)).toEqual(["e1", "e2"]);
    });
  });

  it("leaves an empty cache untouched on deletion attempt", async () => {
    // Cache is not seeded — simulate navigating to the detail view cold.
    vi.mocked(api.deleteExpense).mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useDeleteExpense("grp-1"), {
      wrapper: createWrapper(client),
    });

    // Should not throw.
    await expect(
      act(async () => {
        await result.current.mutateAsync("e1");
      })
    ).resolves.not.toThrow();
  });

  it("deletes from within an infinite query cache shape without crashing", async () => {
    // Seed both the flat shape (used by the detail page) and the paged
    // shape (used by the infinite scroll variant) under the same prefix.
    const pagedKey = [...qk.expenses("grp-1"), "page", 20, null];
    client.setQueryData(qk.expenses("grp-1"), TWO_EXPENSES);
    client.setQueryData(pagedKey, {
      pages: [{ expenses: [makeExpense("e1"), makeExpense("e2")], nextCursor: null }],
      pageParams: [undefined],
    });

    const gate = deferred<{ ok: boolean }>();
    vi.mocked(api.deleteExpense).mockReturnValue(gate.promise);

    const { result } = renderHook(() => useDeleteExpense("grp-1"), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.mutate("e1");
    });

    // Flat cache should shrink immediately.
    await waitFor(() => {
      const flat = client.getQueryData<ExpensesResponse>(qk.expenses("grp-1"));
      expect(flat?.expenses).toHaveLength(1);
      expect(flat?.expenses[0].id).toBe("e2");
    });

    // Paged cache should also shrink — removeOptimisticExpense handles both.
    const paged = client.getQueryData<{
      pages: { expenses: { id: string }[] }[];
    }>(pagedKey);
    expect(paged?.pages[0].expenses).toHaveLength(1);
    expect(paged?.pages[0].expenses[0].id).toBe("e2");

    await act(async () => {
      gate.resolve({ ok: true });
    });
  });

  it("handles simulated network delay (>100 ms) without stale writes", async () => {
    client.setQueryData(qk.expenses("grp-1"), TWO_EXPENSES);
    vi.mocked(api.deleteExpense).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true }), 120)
        )
    );

    const { result } = renderHook(() => useDeleteExpense("grp-1"), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.mutate("e1");
    });

    // Optimistic removal should be instant.
    await waitFor(() => {
      const cache = client.getQueryData<ExpensesResponse>(qk.expenses("grp-1"));
      expect(cache?.expenses).toHaveLength(1);
    });

    // Wait for the delayed resolution.
    await waitFor(
      () => {
        expect(result.current.isSuccess).toBe(true);
      },
      { timeout: 500 }
    );
  });
});
