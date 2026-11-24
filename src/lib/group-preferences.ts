"use client";

/**
 * Persisted group preferences: active group tabs, sort orders, and transaction history filters (#947).
 */

import type { HistoryFilters } from "./historyFilter";

export interface GroupPreferences {
  activeTab?: string;
  sortOrder?: string;
  transactionFilters?: HistoryFilters;
}

const STORAGE_KEY_PREFIX = "mergepay:group_preferences:";

export const DEFAULT_GROUP_PREFERENCES: GroupPreferences = {
  activeTab: "expenses",
  sortOrder: "newest",
  transactionFilters: { kind: "all" },
};

function getStorageKey(groupId: string): string {
  return `${STORAGE_KEY_PREFIX}${groupId}`;
}

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getStoredGroupPreferences(groupId: string): GroupPreferences {
  const storage = safeStorage();
  if (!storage || !groupId) return DEFAULT_GROUP_PREFERENCES;
  try {
    const raw = storage.getItem(getStorageKey(groupId));
    if (!raw) return DEFAULT_GROUP_PREFERENCES;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_GROUP_PREFERENCES;
    }
    const pref = parsed as Record<string, unknown>;
    return {
      activeTab: typeof pref.activeTab === "string" ? pref.activeTab : DEFAULT_GROUP_PREFERENCES.activeTab,
      sortOrder: typeof pref.sortOrder === "string" ? pref.sortOrder : DEFAULT_GROUP_PREFERENCES.sortOrder,
      transactionFilters: typeof pref.transactionFilters === "object" && pref.transactionFilters !== null
        ? (pref.transactionFilters as HistoryFilters)
        : DEFAULT_GROUP_PREFERENCES.transactionFilters,
    };
  } catch {
    return DEFAULT_GROUP_PREFERENCES;
  }
}

export function setStoredGroupPreferences(groupId: string, prefs: Partial<GroupPreferences>): GroupPreferences {
  const storage = safeStorage();
  if (!storage || !groupId) return DEFAULT_GROUP_PREFERENCES;
  try {
    const current = getStoredGroupPreferences(groupId);
    const next = { ...current, ...prefs };
    storage.setItem(getStorageKey(groupId), JSON.stringify(next));
    return next;
  } catch {
    return getStoredGroupPreferences(groupId);
  }
}
