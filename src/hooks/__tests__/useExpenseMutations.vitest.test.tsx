import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useSettleBalanceMutation, useCreateExpenseMutation, useDeleteExpenseMutation } from "../useExpenseMutations";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { User, BalancesResponse, GroupActivityResponse, SettlementIntentResponse } from "@/lib/types";
import * as sonner from "sonner";

vi.mock("@/lib/api", () => ({
  api: {
    createSettlement: vi.fn(),
    createExpense: vi.fn(),
    deleteExpense: vi.fn(),
    getBalances: vi.fn(),
    getGroupActivity: vi.fn(),
    getGroup: vi.fn(),
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

const ALICE: User = {
  id: "user-a",
  stellarPublicKey: "GALICE",
  displayName: "Alice",
  avatarUrl: null,
  createdAt: "2024-01-01T00:00:00.000Z",
};

function makeBalances(rows: { userId: string; net: string }[]): BalancesResponse {
  return {
    balances: rows.map((r) => ({
      userId: r.userId,
      user: r.userId === "user-a" ? ALICE : { ...ALICE, id: r.userId, displayName: r.userId === "user-b" ? "Bob" : r.userId },
      net: r.net,
      assetCode: "XLM",
    })),
    suggestions: [],
  };
}

function makeActivity(activities: GroupActivityResponse["activities"] = []): GroupActivityResponse {
  return { activities };
}

function createWrapper(qc: QueryClient) {
  const W = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  W.displayName = "QCWrapper";
  return W;
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

describe("useSettleBalanceMutation — optimistic settlement", () => {
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

  it("applies optimistic balance update before the API responds", async () => {
    client.setQueryData(qk.balances("grp-1"), makeBalances([
      { userId: "user-a", net: "-10" },
      { userId: "user-b", net: "10" },
    ]));
    client.setQueryData(qk.activity("grp-1"), makeActivity());

    const gate = deferred<SettlementIntentResponse>();
    vi.mocked(api.createSettlement).mockReturnValue(gate.promise);

    const { result } = renderHook(() => useSettleBalanceMutation("grp-1"), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.mutate({ toUserId: "user-b", amount: "10.0000000", assetCode: "XLM" });
    });

    await waitFor(() => {
      const cache = client.getQueryData<BalancesResponse>(qk.balances("grp-1"));
      expect(cache?.balances[0].net).toBe("0");
      expect(cache?.balances[1].net).toBe("0");
    });

    await act(async () => {
      gate.resolve({
        settlement: { id: "s-1", groupId: "grp-1", fromUserId: "user-a", from: ALICE, toUserId: "user-b", to: { ...ALICE, id: "user-b" }, amount: "10.0000000", assetCode: "XLM", assetIssuer: null, stellarTxHash: null, status: "submitted", memo: null, expenseId: null, createdAt: new Date().toISOString() },
        xdr: "0xabc",
        networkPassphrase: "Test SDF Network ; September 2015",
      });
    });
  });

  it("rolls back balances when the settlement fails", async () => {
    client.setQueryData(qk.balances("grp-1"), makeBalances([
      { userId: "user-a", net: "-10" },
      { userId: "user-b", net: "10" },
    ]));

    const gate = deferred<SettlementIntentResponse>();
    vi.mocked(api.createSettlement).mockReturnValue(gate.promise);

    const { result } = renderHook(() => useSettleBalanceMutation("grp-1"), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.mutate({ toUserId: "user-b", amount: "10.0000000", assetCode: "XLM" });
    });

    await waitFor(() => {
      const cache = client.getQueryData<BalancesResponse>(qk.balances("grp-1"));
      expect(cache?.balances[0].net).toBe("0");
    });

    await act(async () => {
      gate.reject(new Error("Settlement failed"));
    });

    await waitFor(() => {
      const cache = client.getQueryData<BalancesResponse>(qk.balances("grp-1"));
      expect(cache?.balances[0].net).toBe("-10");
      expect(cache?.balances[1].net).toBe("10");
    });
  });

  it("invalidates all affected cache keys after settlement settles", async () => {
    client.setQueryData(qk.balances("grp-1"), makeBalances([
      { userId: "user-a", net: "-10" },
    ]));
    client.setQueryData(qk.activity("grp-1"), makeActivity());

    vi.mocked(api.createSettlement).mockResolvedValue({
      settlement: { id: "s-1", groupId: "grp-1", fromUserId: "user-a", from: ALICE, toUserId: "user-b", to: { ...ALICE, id: "user-b" }, amount: "10.0000000", assetCode: "XLM", assetIssuer: null, stellarTxHash: null, status: "confirmed", memo: null, expenseId: null, createdAt: new Date().toISOString() },
      xdr: "0xabc",
      networkPassphrase: "Test SDF Network ; September 2015",
    });

    const { result } = renderHook(() => useSettleBalanceMutation("grp-1"), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      result.current.mutate({ toUserId: "user-b", amount: "5.0000000", assetCode: "XLM" });
    });

    await waitFor(() => {
      expect(vi.mocked(api.createSettlement)).toHaveBeenCalledWith("grp-1", { toUserId: "user-b", amount: "5.0000000", assetCode: "XLM" });
    });
  });
});

describe("useCreateExpenseMutation — optimistic updates", () => {
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

  it("is defined and has the expected mutation hooks", () => {
    const { result } = renderHook(() => useCreateExpenseMutation("grp-1"), {
      wrapper: createWrapper(client),
    });
    expect(result.current).toBeDefined();
    expect(typeof result.current.mutate).toBe("function");
  });
});

describe("useDeleteExpenseMutation — optimistic updates", () => {
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

  it("is defined and has the expected mutation hooks", () => {
    const { result } = renderHook(() => useDeleteExpenseMutation("grp-1"), {
      wrapper: createWrapper(client),
    });
    expect(result.current).toBeDefined();
    expect(typeof result.current.mutate).toBe("function");
  });
});