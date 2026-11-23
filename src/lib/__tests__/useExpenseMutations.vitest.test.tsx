import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCreateExpenseMutation, useDeleteExpenseMutation } from "@/hooks/useExpenseMutations";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import { toast } from "sonner";
import type { User } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: {
    createExpense: vi.fn(),
    deleteExpense: vi.fn(),
    getBalances: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/auth-store", () => {
  const authState = { token: "test-token", user: { id: "user-a", displayName: "Alice", stellarPublicKey: "GALICE", avatarUrl: null, createdAt: "2024-01-01T00:00:00.000Z" } };
  const mockFn = vi.fn().mockReturnValue(authState) as unknown as typeof import("@/lib/auth-store").useAuth & { getState: () => typeof authState };
  mockFn.getState = vi.fn().mockReturnValue(authState);
  return { useAuth: mockFn };
});

function createWrapper(client?: QueryClient) {
  const qc =
    client ??
    new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "QueryWrapper";
  return Wrapper;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useExpenseMutations — optimistic UI updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts expense optimistically into cache before API resolves", async () => {
    const def = deferred<any>();
    vi.mocked(api.createExpense).mockReturnValue(def.promise);

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(qk.expenses("g1"), { expenses: [] });

    const { result } = renderHook(() => useCreateExpenseMutation("g1"), {
      wrapper: createWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        title: "Dinner",
        amount: "50.00",
        assetCode: "USDC",
        splitType: "equal",
        shares: [{ userId: "user-b" }],
      });
    });

    await waitFor(() => {
      const cached = qc.getQueryData<any>(qk.expenses("g1"));
      expect(cached?.expenses).toHaveLength(1);
      expect(cached?.expenses[0].title).toBe("Dinner");
      expect(cached?.expenses[0].isOptimistic).toBe(true);
    });

    act(() => {
      def.resolve({ id: "e-server", title: "Dinner", amount: "50.00", assetCode: "USDC" });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Expense created successfully");
    });
  });

  it("rolls back expense from cache when creation fails", async () => {
    const def = deferred<any>();
    vi.mocked(api.createExpense).mockReturnValue(def.promise);

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(qk.expenses("g1"), { expenses: [] });

    const { result } = renderHook(() => useCreateExpenseMutation("g1"), {
      wrapper: createWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        title: "Dinner",
        amount: "50.00",
        assetCode: "USDC",
        splitType: "equal",
        shares: [{ userId: "user-b" }],
      });
    });

    await waitFor(() => {
      const cached = qc.getQueryData<any>(qk.expenses("g1"));
      expect(cached?.expenses).toHaveLength(1);
    });

    act(() => {
      def.reject(new Error("Network error"));
    });

    await waitFor(() => {
      const cached = qc.getQueryData<any>(qk.expenses("g1"));
      expect(cached?.expenses).toHaveLength(0);
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("removes expense optimistically from cache on deletion", async () => {
    const def = deferred<any>();
    vi.mocked(api.deleteExpense).mockReturnValue(def.promise);

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(qk.expenses("g1"), {
      expenses: [{ id: "e-1", title: "Coffee", amount: "5.00", assetCode: "USDC" }],
    });

    const { result } = renderHook(() => useDeleteExpenseMutation("g1"), {
      wrapper: createWrapper(qc),
    });

    act(() => {
      result.current.mutate("e-1");
    });

    await waitFor(() => {
      const cached = qc.getQueryData<any>(qk.expenses("g1"));
      expect(cached?.expenses).toHaveLength(0);
    });

    act(() => {
      def.resolve(undefined);
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Expense deleted successfully");
    });
  });

  it("restores expense in cache when deletion fails", async () => {
    const def = deferred<any>();
    vi.mocked(api.deleteExpense).mockReturnValue(def.promise);

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const existingExpense = { id: "e-1", title: "Coffee", amount: "5.00", assetCode: "USDC" };
    qc.setQueryData(qk.expenses("g1"), {
      expenses: [existingExpense],
    });

    const { result } = renderHook(() => useDeleteExpenseMutation("g1"), {
      wrapper: createWrapper(qc),
    });

    act(() => {
      result.current.mutate("e-1");
    });

    await waitFor(() => {
      const cached = qc.getQueryData<any>(qk.expenses("g1"));
      expect(cached?.expenses).toHaveLength(0);
    });

    act(() => {
      def.reject(new Error("Deletion failed"));
    });

    await waitFor(() => {
      const cached = qc.getQueryData<any>(qk.expenses("g1"));
      expect(cached?.expenses).toHaveLength(1);
      expect(cached?.expenses[0].id).toBe("e-1");
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
