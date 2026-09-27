import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreateExpenseMutation, useSettleBalanceMutation } from "./useExpenseMutations";
import { api } from "@/lib/api";
import { toast } from "sonner";
import React from "react";
import { qk } from "@/lib/queries";
import type { ExpenseResponse } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: {
    createExpense: vi.fn(),
    createSettlement: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "QueryWrapper";
  return Wrapper;
}

describe("useExpenseMutations Hooks (#285)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useCreateExpenseMutation executes createExpense and triggers toasts & query invalidation", async () => {
    const mockExpense = { id: "e1", title: "Lunch", amount: "15.00" };
    vi.mocked(api.createExpense).mockResolvedValue(mockExpense as any);

    const { result } = renderHook(() => useCreateExpenseMutation("g1"), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        title: "Lunch",
        amount: "15.00",
        assetCode: "USDC",
        splitType: "equal",
        shares: [{ userId: "u2" }],
      });
    });

    expect(api.createExpense).toHaveBeenCalledWith("g1", expect.objectContaining({ title: "Lunch" }));
    expect(toast.success).toHaveBeenCalledWith("Expense created successfully");
  });

  it("updates the expense list optimistically before the network confirms (#488)", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(qk.expenses("g1"), { expenses: [{ id: "e0", title: "Rent" }] });

    let resolveCreate!: (value: ExpenseResponse) => void;
    vi.mocked(api.createExpense).mockReturnValue(
      new Promise<ExpenseResponse>((resolve) => {
        resolveCreate = resolve;
      })
    );

    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateExpenseMutation("g1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({
        title: "Coffee",
        amount: "10.00",
        assetCode: "USDC",
        splitType: "equal",
        payerUserId: "u-1",
        shares: [{ userId: "u-2" }],
      });
    });

    await waitFor(() => {
      const cache = qc.getQueryData<any>(qk.expenses("g1"));
      expect(cache.expenses).toHaveLength(2);
      expect(cache.expenses[0]).toMatchObject({
        title: "Coffee",
        amount: "10.00",
        assetCode: "USDC",
        isOptimistic: true,
        pending: true,
      });
    });

    // The request is still in flight at this point.
    expect(api.createExpense).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate({} as ExpenseResponse);
      await Promise.resolve();
    });
  });

  it("rolls the expense list back and surfaces a sonner error when creation fails (#488)", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(qk.expenses("g1"), { expenses: [{ id: "e0", title: "Rent" }] });

    vi.mocked(api.createExpense).mockRejectedValueOnce(new Error("Network error"));

    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateExpenseMutation("g1"), {
      wrapper: Wrapper,
    });

    let errorThrown: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({
          title: "Coffee",
          amount: "10.00",
          assetCode: "USDC",
          splitType: "equal",
          payerUserId: "u-1",
          shares: [{ userId: "u-2" }],
        });
      } catch (err) {
        errorThrown = err;
      }
    });

    expect(errorThrown).toBeDefined();

    const cache = qc.getQueryData<any>(qk.expenses("g1"));
    expect(cache.expenses).toHaveLength(1);
    expect(cache.expenses[0].id).toBe("e0");
    expect(toast.error).toHaveBeenCalledWith("Network error");
  });

  it("useSettleBalanceMutation executes createSettlement and triggers toasts", async () => {
    const mockSettlement = { id: "s1", amount: "10.00" };
    vi.mocked(api.createSettlement).mockResolvedValue(mockSettlement as any);

    const { result } = renderHook(() => useSettleBalanceMutation("g1"), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        toUserId: "u2",
        amount: "10.00",
        assetCode: "USDC",
      });
    });

    expect(api.createSettlement).toHaveBeenCalledWith("g1", expect.objectContaining({ toUserId: "u2" }));
    expect(toast.success).toHaveBeenCalledWith("Settlement executed successfully");
  });

  it("useSettleBalanceMutation performs optimistic update and rolls back on error with sonner toast", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(qk.balances("g1"), {
      netBalances: [{ userId: "u2", netAmount: "-10.00" }],
      assetCode: "USDC",
    });

    vi.mocked(api.createSettlement).mockRejectedValueOnce(new Error("Network error"));

    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSettleBalanceMutation("g1"), {
      wrapper: Wrapper,
    });

    let errorThrown: any;
    await act(async () => {
      try {
        await result.current.mutateAsync({
          toUserId: "u2",
          amount: "10.00",
          assetCode: "USDC",
        });
      } catch (err) {
        errorThrown = err;
      }
    });

    expect(errorThrown).toBeDefined();
    expect(toast.error).toHaveBeenCalledWith("Settlement failed. Balances rolled back.");

    // Verify balances rolled back to previous state
    const balances: any = qc.getQueryData(qk.balances("g1"));
    expect(balances.netBalances[0].netAmount).toBe("-10.00");
  });
});
