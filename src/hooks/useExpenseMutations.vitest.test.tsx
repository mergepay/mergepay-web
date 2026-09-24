import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreateExpenseMutation, useSettleBalanceMutation } from "./useExpenseMutations";
import { api } from "@/lib/api";
import { toast } from "sonner";
import React from "react";
import { qk } from "@/lib/queries";
import { useAuth } from "@/lib/auth-store";
import type { BalancesResponse, ExpensesResponse, User } from "@/lib/types";

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

/** A promise plus its handles, so a mutation can be inspected mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

const ME: User = {
  id: "me",
  stellarPublicKey: "GME",
  displayName: "Me",
  avatarUrl: null,
  createdAt: "2024-01-01T00:00:00.000Z",
};

const OTHER: User = {
  id: "u2",
  stellarPublicKey: "GU2",
  displayName: "Grace",
  avatarUrl: null,
  createdAt: "2024-01-01T00:00:00.000Z",
};

const SEEDED_EXPENSES: ExpensesResponse = {
  expenses: [
    {
      id: "exp-1",
      groupId: "g1",
      payerUserId: "me",
      payer: ME,
      title: "Coffee",
      description: null,
      amount: "5.0000000",
      assetCode: "USDC",
      assetIssuer: null,
      splitType: "equal",
      memo: null,
      receiptUrl: null,
      createdAt: "2024-05-01T00:00:00.000Z",
      shares: [],
    },
  ],
};

const SEEDED_BALANCES: BalancesResponse = {
  balances: [
    { userId: "me", user: ME, net: "10", assetCode: "USDC" },
    { userId: "u2", user: OTHER, net: "-10", assetCode: "USDC" },
  ],
  suggestions: [],
};

const NEW_EXPENSE_REQUEST = {
  title: "Pizza",
  amount: "20.0000000",
  assetCode: "USDC",
  splitType: "equal" as const,
  shares: [{ userId: "me" }, { userId: "u2" }],
};

describe("optimistic updates (#375)", () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    // Signed-in user without a token, so `useMe` stays disabled while the
    // mutation still knows who is paying.
    useAuth.setState({ user: ME });
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    useAuth.setState({ user: null });
    client.clear();
  });

  it("shows the new expense in the list before the API responds", async () => {
    client.setQueryData(qk.expenses("g1"), SEEDED_EXPENSES);
    const gate = deferred<unknown>();
    vi.mocked(api.createExpense).mockReturnValue(gate.promise as never);

    const { result } = renderHook(() => useCreateExpenseMutation("g1"), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.mutate(NEW_EXPENSE_REQUEST);
    });

    await waitFor(() => {
      const cache = client.getQueryData<ExpensesResponse>(qk.expenses("g1"));
      expect(cache?.expenses[0]?.isOptimistic).toBe(true);
    });

    const cache = client.getQueryData<ExpensesResponse>(qk.expenses("g1"));
    expect(cache?.expenses).toHaveLength(2);
    expect(cache?.expenses[0].title).toBe("Pizza");
    expect(cache?.expenses[0].shares).toHaveLength(2);
    expect(cache?.expenses[1].id).toBe("exp-1");

    await act(async () => {
      gate.resolve({ expense: { id: "server-1" } });
    });
  });

  it("rolls the list back when the expense creation fails", async () => {
    client.setQueryData(qk.expenses("g1"), SEEDED_EXPENSES);
    const gate = deferred<unknown>();
    vi.mocked(api.createExpense).mockReturnValue(gate.promise as never);

    const { result } = renderHook(() => useCreateExpenseMutation("g1"), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.mutate(NEW_EXPENSE_REQUEST);
    });

    await waitFor(() => {
      const cache = client.getQueryData<ExpensesResponse>(qk.expenses("g1"));
      expect(cache?.expenses[0]?.isOptimistic).toBe(true);
    });

    await act(async () => {
      gate.reject(new Error("network down"));
    });

    await waitFor(() => {
      const cache = client.getQueryData<ExpensesResponse>(qk.expenses("g1"));
      expect(cache?.expenses).toHaveLength(1);
      expect(cache?.expenses[0].id).toBe("exp-1");
      expect(cache?.expenses[0].isOptimistic).toBeUndefined();
    });
    expect(toast.error).toHaveBeenCalled();
  });

  it("moves balances instantly for a settlement and restores them on failure", async () => {
    client.setQueryData(qk.balances("g1"), SEEDED_BALANCES);
    const gate = deferred<unknown>();
    vi.mocked(api.createSettlement).mockReturnValue(gate.promise as never);

    const { result } = renderHook(() => useSettleBalanceMutation("g1"), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.mutate({
        toUserId: "u2",
        amount: "4.0000000",
        assetCode: "USDC",
      });
    });

    // Payer's credit rises by the amount, the payee's debt deepens by it.
    await waitFor(() => {
      const balances = client.getQueryData<BalancesResponse>(qk.balances("g1"));
      expect(balances?.balances[0].net).toBe("14");
      expect(balances?.balances[1].net).toBe("-14");
    });

    await act(async () => {
      gate.reject(new Error("network down"));
    });

    await waitFor(() => {
      const balances = client.getQueryData<BalancesResponse>(qk.balances("g1"));
      expect(balances?.balances[0].net).toBe("10");
      expect(balances?.balances[1].net).toBe("-10");
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Settlement failed. Balances rolled back."
    );
  });
});
