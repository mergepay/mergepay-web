/**
 * Optimistic expense editing and history-aware deletion (#892).
 *
 * Verifies:
 *  - an edit is visible in every cached copy (group list + history feed)
 *    before the API responds, flagged `pending`;
 *  - the server's copy replaces the prediction on success;
 *  - every cache is restored and the user is notified when the API fails;
 *  - deletion removes the expense from the history feed too, and restores it
 *    on failure.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import { patchOptimisticExpense } from "@/lib/optimistic";
import { useDeleteExpenseMutation, useUpdateExpenseMutation } from "./useExpenseMutations";
import type { Expense, ExpenseResponse, ExpensesResponse, User } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { updateExpense: vi.fn(), deleteExpense: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const ME: User = {
  id: "me",
  stellarPublicKey: "GME",
  displayName: "Alice",
  avatarUrl: null,
  createdAt: "2024-01-01T00:00:00.000Z",
};

function makeExpense(id: string, overrides: Partial<Expense> = {}): Expense {
  return {
    id,
    groupId: "g1",
    payerUserId: "me",
    payer: ME,
    title: `Expense ${id}`,
    description: null,
    amount: "10",
    assetCode: "USDC",
    assetIssuer: null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2024-05-01T00:00:00.000Z",
    shares: [],
    ...overrides,
  };
}

const HISTORY_KEY = [...qk.history, "page", 20] as const;

function seed(client: QueryClient) {
  const expenses: ExpensesResponse = { expenses: [makeExpense("exp-1"), makeExpense("exp-2")] };
  client.setQueryData(qk.expenses("g1"), expenses);
  client.setQueryData(HISTORY_KEY, {
    pages: [{ expenses: [makeExpense("exp-1")], settlements: [] }],
    pageParams: [undefined],
  });
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

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  seed(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const listed = (client: QueryClient) =>
  client.getQueryData<ExpensesResponse>(qk.expenses("g1"))!.expenses;
const historyExpenses = (client: QueryClient) =>
  client.getQueryData<{ pages: Array<{ expenses: Expense[] }> }>(HISTORY_KEY)!.pages[0].expenses;

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("patchOptimisticExpense", () => {
  it("returns the same reference when the id is not cached", () => {
    const cache = { expenses: [makeExpense("a")] };
    expect(patchOptimisticExpense(cache, "missing", { title: "x" })).toBe(cache);
  });

  it("patches flat arrays and marks the entry pending", () => {
    const [patched] = patchOptimisticExpense([makeExpense("a")], "a", { title: "New" });
    expect(patched.title).toBe("New");
    expect(patched.pending).toBe(true);
  });

  it("clears pending when told to", () => {
    const [patched] = patchOptimisticExpense([makeExpense("a", { pending: true })], "a", { pending: false });
    expect(patched.pending).toBe(false);
  });

  it("ignores undefined fields but applies explicit nulls", () => {
    const [patched] = patchOptimisticExpense(
      [makeExpense("a", { description: "old", memo: "MP:x" })],
      "a",
      { description: null, memo: undefined }
    );
    expect(patched.description).toBeNull();
    expect(patched.memo).toBe("MP:x");
  });

  it("leaves unrecognised shapes untouched", () => {
    const weird = { foo: 1 };
    expect(patchOptimisticExpense(weird, "a", { title: "x" })).toBe(weird);
    expect(patchOptimisticExpense(undefined, "a", { title: "x" })).toBeUndefined();
  });
});

describe("useUpdateExpenseMutation", () => {
  it("applies the edit to every cache before the API responds", async () => {
    const { client, wrapper } = setup();
    const pending = deferred<ExpenseResponse>();
    vi.mocked(api.updateExpense).mockReturnValue(pending.promise);

    const { result } = renderHook(() => useUpdateExpenseMutation("g1"), { wrapper });
    act(() => {
      result.current.mutate({ expenseId: "exp-1", data: { title: "Dinner", memo: "MP:dinner" } });
    });

    await waitFor(() => expect(listed(client)[0].title).toBe("Dinner"));
    expect(listed(client)[0]).toMatchObject({ memo: "MP:dinner", pending: true });
    expect(listed(client)[1].title).toBe("Expense exp-2");
    expect(historyExpenses(client)[0]).toMatchObject({ title: "Dinner", pending: true });
    expect(api.updateExpense).toHaveBeenCalledWith("exp-1", { title: "Dinner", memo: "MP:dinner" });

    await act(async () => {
      pending.resolve({ expense: makeExpense("exp-1", { title: "Dinner (server)", memo: "MP:dinner" }) });
      await pending.promise;
    });

    await waitFor(() => expect(listed(client)[0].title).toBe("Dinner (server)"));
    expect(listed(client)[0].pending).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("Expense updated");
  });

  it("rolls every cache back and notifies the user on failure", async () => {
    const { client, wrapper } = setup();
    const pending = deferred<ExpenseResponse>();
    vi.mocked(api.updateExpense).mockReturnValue(pending.promise);
    const before = structuredClone(listed(client));
    const historyBefore = structuredClone(historyExpenses(client));

    const { result } = renderHook(() => useUpdateExpenseMutation("g1"), { wrapper });
    act(() => {
      result.current.mutate({ expenseId: "exp-1", data: { title: "Oops" } });
    });
    await waitFor(() => expect(listed(client)[0].title).toBe("Oops"));

    await act(async () => {
      pending.reject(new Error("network down"));
      await pending.promise.catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(listed(client)).toEqual(before);
    expect(historyExpenses(client)).toEqual(historyBefore);
    expect(toast.error).toHaveBeenCalledWith(
      "Could not save your changes. The expense has been restored."
    );
  });

  it("stores an emptied description as null optimistically", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(qk.expenses("g1"), { expenses: [makeExpense("exp-1", { description: "old" })] });
    vi.mocked(api.updateExpense).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useUpdateExpenseMutation("g1"), { wrapper });
    act(() => {
      result.current.mutate({ expenseId: "exp-1", data: { description: "" } });
    });
    await waitFor(() => expect(listed(client)[0].description).toBeNull());
  });
});

describe("useDeleteExpenseMutation — history feed", () => {
  it("removes the expense from the history cache immediately", async () => {
    const { client, wrapper } = setup();
    vi.mocked(api.deleteExpense).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useDeleteExpenseMutation("g1"), { wrapper });
    act(() => result.current.mutate("exp-1"));

    await waitFor(() => expect(historyExpenses(client)).toHaveLength(0));
    expect(listed(client).map((e) => e.id)).toEqual(["exp-2"]);
  });

  it("restores the history cache when deletion fails", async () => {
    const { client, wrapper } = setup();
    const pending = deferred<{ ok: boolean }>();
    vi.mocked(api.deleteExpense).mockReturnValue(pending.promise);

    const { result } = renderHook(() => useDeleteExpenseMutation("g1"), { wrapper });
    act(() => result.current.mutate("exp-1"));
    await waitFor(() => expect(historyExpenses(client)).toHaveLength(0));

    await act(async () => {
      pending.reject(new Error("500"));
      await pending.promise.catch(() => {});
    });

    await waitFor(() => expect(historyExpenses(client).map((e) => e.id)).toEqual(["exp-1"]));
    expect(listed(client).map((e) => e.id)).toEqual(["exp-1", "exp-2"]);
    expect(toast.error).toHaveBeenCalled();
  });
});
