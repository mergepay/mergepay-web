"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { ExpenseStatusFilter } from "./expenseFilters";
import type { Expense } from "./types";

export type ExpenseSortOrder = "newest" | "oldest" | "amount-desc" | "amount-asc";

export const EXPENSE_SORT_ORDERS: readonly ExpenseSortOrder[] = [
  "newest",
  "oldest",
  "amount-desc",
  "amount-asc",
];

export const VALID_PAGE_SIZES: readonly number[] = [10, 25, 50];

export interface GroupExpenseFilterPreferences {
  keyword: string;
  payer: string;
  status: ExpenseStatusFilter;
  assetCode: string;
  fromDate: string;
  toDate: string;
  pageSize: number;
  sortOrder: ExpenseSortOrder;
}

export const DEFAULT_GROUP_EXPENSE_FILTERS: GroupExpenseFilterPreferences = {
  keyword: "",
  payer: "",
  status: "all",
  assetCode: "",
  fromDate: "",
  toDate: "",
  pageSize: 10,
  sortOrder: "newest",
};

export const GROUP_FILTER_STORAGE_KEY = "mergepay:group-filters:v1";
export const GROUP_FILTER_STORAGE_VERSION = 1;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_GROUPS_CACHED = 50;
const MAX_TEXT_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStatusFilter(value: unknown): value is ExpenseStatusFilter {
  return value === "all" || value === "settled" || value === "pending";
}

function isSortOrder(value: unknown): value is ExpenseSortOrder {
  return typeof value === "string" && (EXPENSE_SORT_ORDERS as readonly string[]).includes(value);
}

function sanitizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.length > MAX_TEXT_LENGTH ? value.slice(0, MAX_TEXT_LENGTH) : value;
}

function sanitizeDate(value: unknown): string {
  return typeof value === "string" && DATE_RE.test(value) ? value : "";
}

function sanitizePageSize(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  return VALID_PAGE_SIZES.includes(num) ? num : DEFAULT_GROUP_EXPENSE_FILTERS.pageSize;
}

/**
 * Validates any untrusted value (e.g. from localStorage or a StorageEvent) into
 * a well-typed `GroupExpenseFilterPreferences`, degrading invalid fields to defaults.
 */
export function sanitizeGroupExpenseFilters(value: unknown): GroupExpenseFilterPreferences {
  if (!isRecord(value)) {
    return { ...DEFAULT_GROUP_EXPENSE_FILTERS };
  }
  return {
    keyword: sanitizeText(value.keyword),
    payer: sanitizeText(value.payer),
    status: isStatusFilter(value.status) ? value.status : DEFAULT_GROUP_EXPENSE_FILTERS.status,
    assetCode: sanitizeText(value.assetCode),
    fromDate: sanitizeDate(value.fromDate),
    toDate: sanitizeDate(value.toDate),
    pageSize: sanitizePageSize(value.pageSize),
    sortOrder: isSortOrder(value.sortOrder)
      ? value.sortOrder
      : DEFAULT_GROUP_EXPENSE_FILTERS.sortOrder,
  };
}

export function sanitizeGroupFilterMap(
  value: unknown
): Record<string, GroupExpenseFilterPreferences> {
  if (!isRecord(value)) return {};
  const result: Record<string, GroupExpenseFilterPreferences> = {};
  const entries = Object.entries(value).slice(0, MAX_GROUPS_CACHED);
  for (const [groupId, prefs] of entries) {
    if (!groupId || typeof groupId !== "string") continue;
    result[groupId] = sanitizeGroupExpenseFilters(prefs);
  }
  return result;
}

/**
 * Parses a raw persisted Zustand envelope string safely. Outdated versions,
 * invalid JSON, or unexpected structures degrade gracefully to an empty map.
 */
export function parseStoredGroupFilterEnvelope(
  raw: string | null
): Record<string, GroupExpenseFilterPreferences> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    if (
      typeof parsed.version === "number" &&
      parsed.version !== GROUP_FILTER_STORAGE_VERSION
    ) {
      return {};
    }
    const state = isRecord(parsed.state) ? parsed.state : parsed;
    return sanitizeGroupFilterMap(state.byGroup);
  } catch {
    return {};
  }
}

export interface SyncStateStorage extends StateStorage {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
  removeItem: (name: string) => void;
}

/**
 * Builds a `StateStorage` adapter that safely wraps `localStorage` and falls
 * back to an in-memory map whenever storage is unavailable (SSR) or throws
 * (`SecurityError`, `QuotaExceededError`, restricted private browsing).
 */
export function createSafeStorageAdapter(
  resolveStorage?: () => Storage | null | undefined
): SyncStateStorage {
  const memoryFallback = new Map<string, string>();

  const getBackend = (): Storage | null => {
    try {
      if (resolveStorage) {
        return resolveStorage() ?? null;
      }
      if (typeof window === "undefined") return null;
      return window.localStorage ?? null;
    } catch {
      return null;
    }
  };

  return {
    getItem(name: string): string | null {
      const storage = getBackend();
      if (storage) {
        try {
          const item = storage.getItem(name);
          if (item !== null) return item;
        } catch {
          // Fall back to in-memory cache when storage reads throw.
        }
      }
      return memoryFallback.get(name) ?? null;
    },
    setItem(name: string, value: string): void {
      memoryFallback.set(name, value);
      const storage = getBackend();
      if (!storage) return;
      try {
        storage.setItem(name, value);
      } catch {
        // QuotaExceededError or private-browsing SecurityError: keep in-memory state.
      }
    },
    removeItem(name: string): void {
      memoryFallback.delete(name);
      const storage = getBackend();
      if (!storage) return;
      try {
        storage.removeItem(name);
      } catch {
        // Ignore restricted storage errors on removal.
      }
    },
  };
}

/** Pure sorter for group expense lists according to the user's chosen order. */
export function sortExpenses(
  expenses: Expense[],
  sortOrder: ExpenseSortOrder = "newest"
): Expense[] {
  if (expenses.length <= 1) return expenses;
  const copy = [...expenses];
  copy.sort((a, b) => {
    switch (sortOrder) {
      case "oldest":
        return a.createdAt.localeCompare(b.createdAt);
      case "amount-desc": {
        const diff = Number(b.amount) - Number(a.amount);
        return Number.isFinite(diff) && diff !== 0
          ? diff
          : b.createdAt.localeCompare(a.createdAt);
      }
      case "amount-asc": {
        const diff = Number(a.amount) - Number(b.amount);
        return Number.isFinite(diff) && diff !== 0
          ? diff
          : b.createdAt.localeCompare(a.createdAt);
      }
      case "newest":
      default:
        return b.createdAt.localeCompare(a.createdAt);
    }
  });
  return copy;
}

interface GroupFilterStoreState {
  byGroup: Record<string, GroupExpenseFilterPreferences>;
  hydrated: boolean;
  getGroupFilters: (groupId: string) => GroupExpenseFilterPreferences;
  setGroupFilters: (groupId: string, patch: Partial<GroupExpenseFilterPreferences>) => void;
  resetGroupFilters: (groupId: string) => void;
  clearAll: () => void;
  syncFromStorage: (rawValue?: string | null) => void;
  setHydrated: (hydrated: boolean) => void;
}

const safeStorageAdapter = createSafeStorageAdapter();

export const useGroupFilterStore = create<GroupFilterStoreState>()(
  persist(
    (set, get) => ({
      byGroup: {},
      hydrated: false,
      getGroupFilters: (groupId: string) => {
        if (!groupId) return { ...DEFAULT_GROUP_EXPENSE_FILTERS };
        const stored = get().byGroup[groupId];
        return stored ? { ...stored } : { ...DEFAULT_GROUP_EXPENSE_FILTERS };
      },
      setGroupFilters: (groupId: string, patch: Partial<GroupExpenseFilterPreferences>) => {
        if (!groupId) return;
        set((state) => {
          const current = state.byGroup[groupId] ?? DEFAULT_GROUP_EXPENSE_FILTERS;
          const next = sanitizeGroupExpenseFilters({ ...current, ...patch });
          const nextMap = { ...state.byGroup, [groupId]: next };
          const keys = Object.keys(nextMap);
          if (keys.length > MAX_GROUPS_CACHED) {
            delete nextMap[keys[0]];
          }
          return { byGroup: nextMap };
        });
      },
      resetGroupFilters: (groupId: string) => {
        if (!groupId) return;
        set((state) => {
          if (!(groupId in state.byGroup)) return state;
          const nextMap = { ...state.byGroup };
          delete nextMap[groupId];
          return { byGroup: nextMap };
        });
      },
      clearAll: () => set({ byGroup: {} }),
      syncFromStorage: (rawValue?: string | null) => {
        try {
          const raw =
            rawValue !== undefined ? rawValue : safeStorageAdapter.getItem(GROUP_FILTER_STORAGE_KEY);
          const nextByGroup = parseStoredGroupFilterEnvelope(raw);
          set({ byGroup: nextByGroup });
        } catch {
          set({ byGroup: {} });
        }
      },
      setHydrated: (hydrated: boolean) => set({ hydrated }),
    }),
    {
      name: GROUP_FILTER_STORAGE_KEY,
      storage: createJSONStorage(() => safeStorageAdapter),
      version: GROUP_FILTER_STORAGE_VERSION,
      partialize: (state) => ({ byGroup: state.byGroup }),
      migrate: (persistedState: unknown, version: number) => {
        if (version !== GROUP_FILTER_STORAGE_VERSION || !isRecord(persistedState)) {
          return { byGroup: {} };
        }
        return { byGroup: sanitizeGroupFilterMap(persistedState.byGroup) };
      },
      merge: (persistedState, currentState) => {
        const persisted = isRecord(persistedState) ? persistedState : {};
        return {
          ...currentState,
          byGroup: sanitizeGroupFilterMap(persisted.byGroup),
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);

/**
 * Listens for cross-tab `storage` events for the group filter store and
 * updates in-memory state safely without ever throwing.
 */
export function subscribeGroupFilterStorageSync(
  onSync?: (byGroup: Record<string, GroupExpenseFilterPreferences>) => void
): () => void {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    try {
      if (event.key !== null && event.key !== GROUP_FILTER_STORAGE_KEY) {
        return;
      }
      if (event.key === null) {
        useGroupFilterStore.getState().clearAll();
      } else {
        useGroupFilterStore.getState().syncFromStorage(event.newValue);
      }
      onSync?.(useGroupFilterStore.getState().byGroup);
    } catch {
      // Never allow cross-tab storage synchronization issues to break the UI.
    }
  };

  try {
    window.addEventListener("storage", handleStorage);
  } catch {
    return () => {};
  }

  return () => {
    try {
      window.removeEventListener("storage", handleStorage);
    } catch {
      // Ignore listener teardown failures in restricted environments.
    }
  };
}
