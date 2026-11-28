export interface GroupPreferences {
  activeTab: string;
  sortOrder: string;
  statusFilter?: string;
  searchQuery?: string;
}

export const DEFAULT_GROUP_PREFERENCES: GroupPreferences = {
  activeTab: "overview",
  sortOrder: "newest",
  statusFilter: "all",
  searchQuery: "",
};

const STORAGE_KEY_PREFIX = "mergepay:group_preferences:";

function getStorageKey(groupId: string): string {
  return `${STORAGE_KEY_PREFIX}${groupId}`;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function sanitizePreferences(raw: unknown): GroupPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_GROUP_PREFERENCES };
  }
  const obj = raw as Record<string, unknown>;
  return {
    activeTab:
      typeof obj.activeTab === "string" && obj.activeTab.length > 0
        ? obj.activeTab
        : DEFAULT_GROUP_PREFERENCES.activeTab,
    sortOrder:
      typeof obj.sortOrder === "string" && obj.sortOrder.length > 0
        ? obj.sortOrder
        : DEFAULT_GROUP_PREFERENCES.sortOrder,
    statusFilter:
      typeof obj.statusFilter === "string"
        ? obj.statusFilter
        : DEFAULT_GROUP_PREFERENCES.statusFilter,
    searchQuery:
      typeof obj.searchQuery === "string"
        ? obj.searchQuery
        : DEFAULT_GROUP_PREFERENCES.searchQuery,
  };
}

export function getStoredGroupPreferences(groupId: string): GroupPreferences {
  const storage = getStorage();
  if (!storage) return { ...DEFAULT_GROUP_PREFERENCES };

  try {
    const raw = storage.getItem(getStorageKey(groupId));
    if (!raw) return { ...DEFAULT_GROUP_PREFERENCES };
    const parsed: unknown = JSON.parse(raw);
    return sanitizePreferences(parsed);
  } catch {
    // Corrupted JSON or restricted storage
  }

  return { ...DEFAULT_GROUP_PREFERENCES };
}

export function setStoredGroupPreferences(
  groupId: string,
  prefs: Partial<GroupPreferences>
): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    const current = getStoredGroupPreferences(groupId);
    const updated = sanitizePreferences({ ...current, ...prefs });
    storage.setItem(getStorageKey(groupId), JSON.stringify(updated));
  } catch {
    // Quota exceeded or storage disabled
  }
}
