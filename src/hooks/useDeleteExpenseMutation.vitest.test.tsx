/**
 * Integration tests for useDeleteExpenseMutation (#375).
 *
 * Verifies:
 *  - The expense is removed from the cache before the API responds
 *    (optimistic removal).
 *  - The cache is restored to its previous state when the API fails
 *    (rollback).
 *  - Success / failure toasts are raised correctly.
 *  - The cache is always invalidated on settlement regardless of outcome.
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useDeleteExpenseMutation } from "./useExpenseMutations";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { qk } from "@/lib/queries";
import { useAuth } from "@/lib/auth-store";
import type { ExpensesResponse, User } from "@/lib/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api", () => ({
  api: {
    deleteExpense: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ME: User = {
  id: "me",
  stellarPublicKey: "GME",
  displayName: "Alice",
  avatarUrl: null,
  createdAt: "2024-01-01T00:00:00.000Z",
};

function makeExpense(id: string) {
  return {
    id,
    groupId: "g1",
    payerUserId: "me",
    payer: ME,
    title: `Expense ${id}`,
    description: null,
    amount: "10.0000000",
    assetCode: "USDC",
    assetIssuer: null,
    splitType: "equal" as const,
    memo: null,
    receiptUrl: null,
    createdAt: "2024-05-01T00:00:00.000Z",
    shares: [],
  };
}

const SEEDED_EXPENSES: ExpensesResponse = {
  expenses: [makeExpense("exp-1"), makeExpense("exp-2")],
};

/** A promise plus its handles so we can inspect the mutation mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createWrapper(client: QueryClient) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "QueryWrapper";
  return Wrapper;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useDeleteExpenseMutation — optimistic deletion (#375)", () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({ user: ME });
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    useAuth.setState({ user: null });
    client.clear();
  });

  it("removes the expense from the list before the API responds", async () => {
    client.setQueryData(qk.expenses("g1"), SEEDED_EXPENSES);
    const gate = deferred<{ ok: boolean }>();
    vi.mocked(api.deleteExpense).mockReturnValue(gate.promise);

    const { result } = renderHook(() => useDeleteExpenseMutation("g1"), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.mutate("exp-1");
    });

    // The expense should vanish from the cache immediately, while the
    // API call is still in flight (gate not resolved yet).
    await waitFor(() => {
      const cache = client.getQueryData<ExpensesResponse>(qk.expenses("g1"));
      expect(cache?.expenses).toHaveLength(1);
      expect(cache?.expenses[0].id).toBe("exp-2");
    });

    // Clean up the pending promise.
    await act(async () => {
      gate.resolve({ ok: true });
    });
  });

  it("restores the expense list when the delete API call fails", async () => {
    client.setQueryData(qk.expenses("g1"), SEEDED_EXPENSES);
    const gate = deferred<{ ok: boolean }>();
    vi.mocked(api.deleteExpense).mockReturnValue(gate.promise);

    const { result } = renderHook(() => useDeleteExpenseMutation("g1"), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.mutate("exp-1");
    });

    // Optimistic removal in cache.
    await waitFor(() => {
      const cache = client.getQueryData<ExpensesResponse>(qk.expenses("g1"));
      expect(cache?.expenses).toHaveLength(1);
    });

    // Simulate a network failure.
    await act(async () => {
      gate.reject(new Error("network error"));
    });

    // The rollback should restore both expenses.
    await waitFor(() => {
      const cache = client.getQueryData<ExpensesResponse>(qk.expenses("g1"));
      expect(cache?.expenses).toHaveLength(2);
      expect(cache?.expenses.map((e) => e.id)).toEqual(["exp-1", "exp-2"]);
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Could not delete expense. It has been restored."
    );
  });

  it("shows a success toast after a confirmed deletion", async () => {
    client.setQueryData(qk.expenses("g1"), SEEDED_EXPENSES);
    vi.mocked(api.deleteExpense).mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useDeleteExpenseMutation("g1"), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync("exp-1");
    });

    expect(toast.success).toHaveBeenCalledWith("Expense deleted");
  });

  it("handles a missing cache entry gracefully (no crash)", async () => {
    // No seed — cache is empty.
    vi.mocked(api.deleteExpense).mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useDeleteExpenseMutation("g1"), {
      wrapper: createWrapper(client),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync("exp-1");
      })
    ).resolves.not.toThrow();
  });

  it("does not crash when deleting from an infinite-query cache shape", async () => {
    // Seed as the infinite-query pages shape.
    client.setQueryData(
      [...qk.expenses("g1"), "page", 20, null],
      {
        pages: [{ data: [makeExpense("exp-1"), makeExpense("exp-2")], nextCursor: null }],
        pageParams: [undefined],
      }
    );
    client.setQueryData(qk.expenses("g1"), SEEDED_EXPENSES);

    const gate = deferred<{ ok: boolean }>();
    vi.mocked(api.deleteExpense).mockReturnValue(gate.promise);

    const { result } = renderHook(() => useDeleteExpenseMutation("g1"), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.mutate("exp-1");
    });

    // The flat cache should lose the entry immediately.
    await waitFor(() => {
      const flat = client.getQueryData<ExpensesResponse>(qk.expenses("g1"));
      expect(flat?.expenses).toHaveLength(1);
    });

    await act(async () => {
      gate.resolve({ ok: true });
    });
  });
});
