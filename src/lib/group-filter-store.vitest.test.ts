import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GROUP_EXPENSE_FILTERS,
  GROUP_FILTER_STORAGE_KEY,
  GROUP_FILTER_STORAGE_VERSION,
  createSafeStorageAdapter,
  parseStoredGroupFilterEnvelope,
  sanitizeGroupExpenseFilters,
  sanitizeGroupFilterMap,
  sortExpenses,
  subscribeGroupFilterStorageSync,
  useGroupFilterStore,
} from "./group-filter-store";
import {
  DEFAULT_GROUP_PREFERENCES,
  getStoredGroupPreferences,
  setStoredGroupPreferences,
} from "./group-preferences";
import {
  DEFAULT_DASHBOARD_PREFERENCES,
  dashboardPreferencesKey,
} from "./dashboard-preferences";
import { useDashboardPreferences } from "./use-dashboard-preferences";
import type { Expense } from "./types";

async function reloadGroupFilterStore() {
  vi.resetModules();
  return (await import("./group-filter-store")).useGroupFilterStore;
}

const DEFAULT_USER = {
  id: "u1",
  stellarPublicKey: "GUSER1",
  displayName: "Ada",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function makeExpense(overrides: Partial<Expense> & { id: string }): Expense {
  return {
    id: overrides.id,
    groupId: overrides.groupId ?? "g1",
    title: overrides.title ?? `Expense ${overrides.id}`,
    amount: overrides.amount ?? "10.00",
    assetCode: overrides.assetCode ?? "USDC",
    assetIssuer: overrides.assetIssuer ?? null,
    payerUserId: overrides.payerUserId ?? "u1",
    payer: overrides.payer ?? DEFAULT_USER,
    splitType: overrides.splitType ?? "equal",
    receiptUrl: overrides.receiptUrl ?? null,
    createdAt: overrides.createdAt ?? "2026-05-01T10:00:00.000Z",
    shares: overrides.shares ?? [],
    description: overrides.description ?? null,
    memo: overrides.memo ?? null,
  };
}

describe("group-filter-store persistence & fallbacks (#829)", () => {
  beforeEach(() => {
    localStorage.clear();
    useGroupFilterStore.getState().clearAll();
  });

  it("persists and restores per-group filter criteria across page reloads", async () => {
    const before = await reloadGroupFilterStore();
    before.getState().setGroupFilters("group-alpha", {
      status: "pending",
      sortOrder: "amount-desc",
      assetCode: "USDC",
      payer: "user-2",
      keyword: "dinner",
      fromDate: "2026-05-01",
      toDate: "2026-05-31",
      pageSize: 25,
    });
    before.getState().setGroupFilters("group-beta", {
      status: "settled",
      sortOrder: "oldest",
      assetCode: "XLM",
    });

    const raw = localStorage.getItem(GROUP_FILTER_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(raw).toContain("group-alpha");
    expect(raw).toContain("amount-desc");

    const after = await reloadGroupFilterStore();
    expect(after.getState().getGroupFilters("group-alpha")).toEqual({
      keyword: "dinner",
      payer: "user-2",
      status: "pending",
      assetCode: "USDC",
      fromDate: "2026-05-01",
      toDate: "2026-05-31",
      pageSize: 25,
      sortOrder: "amount-desc",
    });
    expect(after.getState().getGroupFilters("group-beta")).toEqual({
      ...DEFAULT_GROUP_EXPENSE_FILTERS,
      status: "settled",
      sortOrder: "oldest",
      assetCode: "XLM",
    });
    expect(after.getState().getGroupFilters("unknown-group")).toEqual(
      DEFAULT_GROUP_EXPENSE_FILTERS
    );
  });

  it("resets a single group without affecting other cached groups", () => {
    useGroupFilterStore.getState().setGroupFilters("g1", { status: "settled", assetCode: "XLM" });
    useGroupFilterStore.getState().setGroupFilters("g2", { status: "pending", assetCode: "USDC" });

    useGroupFilterStore.getState().resetGroupFilters("g1");

    expect(useGroupFilterStore.getState().getGroupFilters("g1")).toEqual(
      DEFAULT_GROUP_EXPENSE_FILTERS
    );
    expect(useGroupFilterStore.getState().getGroupFilters("g2")).toEqual({
      ...DEFAULT_GROUP_EXPENSE_FILTERS,
      status: "pending",
      assetCode: "USDC",
    });
  });

  it("degrades corrupted, malformed, or outdated storage payloads to defaults", async () => {
    expect(parseStoredGroupFilterEnvelope(null)).toEqual({});
    expect(parseStoredGroupFilterEnvelope("{corrupted-json")).toEqual({});
    expect(parseStoredGroupFilterEnvelope(JSON.stringify("not-an-object"))).toEqual({});
    expect(parseStoredGroupFilterEnvelope(JSON.stringify([1, 2, 3]))).toEqual({});

    // Outdated schema version degrades safely to empty map.
    expect(
      parseStoredGroupFilterEnvelope(
        JSON.stringify({
          version: GROUP_FILTER_STORAGE_VERSION + 99,
          state: { byGroup: { g1: { status: "settled" } } },
        })
      )
    ).toEqual({});

    // Invalid individual field values sanitize to defaults while keeping valid fields.
    expect(
      sanitizeGroupExpenseFilters({
        keyword: 123,
        payer: null,
        status: "bogus",
        assetCode: "EURC",
        fromDate: "not-a-date",
        toDate: "2026-06-15",
        pageSize: 999,
        sortOrder: "random-order",
      })
    ).toEqual({
      keyword: "",
      payer: "",
      status: "all",
      assetCode: "EURC",
      fromDate: "",
      toDate: "2026-06-15",
      pageSize: 10,
      sortOrder: "newest",
    });

    expect(sanitizeGroupFilterMap(["bad"])).toEqual({});

    // Rehydrating store from corrupted JSON in localStorage never throws.
    localStorage.setItem(GROUP_FILTER_STORAGE_KEY, "{{{broken");
    const reloaded = await reloadGroupFilterStore();
    expect(reloaded.getState().getGroupFilters("g1")).toEqual(DEFAULT_GROUP_EXPENSE_FILTERS);
  });

  it("falls back safely to in-memory storage when localStorage throws or is unavailable", () => {
    const throwingBackend = {
      getItem: () => {
        throw new DOMException("Access denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
      removeItem: () => {
        throw new DOMException("Access denied", "SecurityError");
      },
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage;

    const throwingAdapter = createSafeStorageAdapter(() => throwingBackend);
    expect(() => throwingAdapter.setItem("k", '{"a":1}')).not.toThrow();
    expect(throwingAdapter.getItem("k")).toBe('{"a":1}');
    expect(() => throwingAdapter.removeItem("k")).not.toThrow();
    expect(throwingAdapter.getItem("k")).toBeNull();

    const blockedGetterAdapter = createSafeStorageAdapter(() => {
      throw new DOMException("Blocked in private mode", "SecurityError");
    });
    expect(() => blockedGetterAdapter.setItem("k2", "v2")).not.toThrow();
    expect(blockedGetterAdapter.getItem("k2")).toBe("v2");

    const missingAdapter = createSafeStorageAdapter(() => undefined);
    expect(missingAdapter.getItem("missing")).toBeNull();
    expect(() => missingAdapter.setItem("missing", "ok")).not.toThrow();
    expect(missingAdapter.getItem("missing")).toBe("ok");
  });

  it("synchronizes state across tabs via StorageEvent without throwing on bad data", () => {
    const syncedSnapshots: Array<Record<string, unknown>> = [];
    const unsubscribe = subscribeGroupFilterStorageSync((byGroup) => {
      syncedSnapshots.push(byGroup);
    });

    try {
      // Valid cross-tab update
      const payload = JSON.stringify({
        version: GROUP_FILTER_STORAGE_VERSION,
        state: {
          byGroup: {
            "g-sync": {
              ...DEFAULT_GROUP_EXPENSE_FILTERS,
              status: "settled",
              sortOrder: "amount-asc",
              assetCode: "XLM",
            },
          },
        },
      });
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: GROUP_FILTER_STORAGE_KEY,
          newValue: payload,
        })
      );

      expect(useGroupFilterStore.getState().getGroupFilters("g-sync")).toEqual({
        ...DEFAULT_GROUP_EXPENSE_FILTERS,
        status: "settled",
        sortOrder: "amount-asc",
        assetCode: "XLM",
      });
      expect(syncedSnapshots).toHaveLength(1);

      // Unrelated storage key is ignored
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "unrelated:key",
          newValue: "anything",
        })
      );
      expect(syncedSnapshots).toHaveLength(1);

      // Corrupted cross-tab payload degrades safely to defaults without throwing
      expect(() =>
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: GROUP_FILTER_STORAGE_KEY,
            newValue: "{not-valid-json",
          })
        )
      ).not.toThrow();
      expect(useGroupFilterStore.getState().getGroupFilters("g-sync")).toEqual(
        DEFAULT_GROUP_EXPENSE_FILTERS
      );

      // Repopulate and simulate localStorage.clear() from another tab (key === null)
      useGroupFilterStore.getState().setGroupFilters("g-sync", { status: "pending" });
      window.dispatchEvent(new StorageEvent("storage", { key: null, newValue: null }));
      expect(useGroupFilterStore.getState().getGroupFilters("g-sync")).toEqual(
        DEFAULT_GROUP_EXPENSE_FILTERS
      );
    } finally {
      unsubscribe();
    }
  });

  it("sorts expenses deterministically across every sort order", () => {
    const expenses = [
      makeExpense({ id: "e1", amount: "25.50", createdAt: "2026-05-02T10:00:00.000Z" }),
      makeExpense({ id: "e2", amount: "100.00", createdAt: "2026-05-01T10:00:00.000Z" }),
      makeExpense({ id: "e3", amount: "5.00", createdAt: "2026-05-03T10:00:00.000Z" }),
    ];

    expect(sortExpenses(expenses, "newest").map((e) => e.id)).toEqual(["e3", "e1", "e2"]);
    expect(sortExpenses(expenses, "oldest").map((e) => e.id)).toEqual(["e2", "e1", "e3"]);
    expect(sortExpenses(expenses, "amount-desc").map((e) => e.id)).toEqual(["e2", "e1", "e3"]);
    expect(sortExpenses(expenses, "amount-asc").map((e) => e.id)).toEqual(["e3", "e1", "e2"]);
  });

  it("sanitizes corrupted field types in group-preferences helper", () => {
    localStorage.setItem(
      "mergepay:group_preferences:g1",
      JSON.stringify({ activeTab: 42, sortOrder: null, statusFilter: ["bad"], searchQuery: {} })
    );
    expect(getStoredGroupPreferences("g1")).toEqual(DEFAULT_GROUP_PREFERENCES);

    setStoredGroupPreferences("g1", { activeTab: "expenses", sortOrder: "oldest" });
    expect(getStoredGroupPreferences("g1")).toEqual({
      ...DEFAULT_GROUP_PREFERENCES,
      activeTab: "expenses",
      sortOrder: "oldest",
    });
  });

  it("syncs dashboard group preferences across tabs via StorageEvent without throwing", () => {
    const { result } = renderHook(() => useDashboardPreferences("user-1"));

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: dashboardPreferencesKey("user-1"),
          newValue: JSON.stringify({
            activeGroupTab: "archived",
            groupSortOrder: "name-asc",
            transactionFilter: "expenses",
          }),
        })
      );
    });

    expect(result.current.preferences).toEqual({
      activeGroupTab: "archived",
      groupSortOrder: "name-asc",
      transactionFilter: "expenses",
    });

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: dashboardPreferencesKey("user-1"),
          newValue: "{broken-json",
        })
      );
    });

    expect(result.current.preferences).toEqual(DEFAULT_DASHBOARD_PREFERENCES);
  });
});
