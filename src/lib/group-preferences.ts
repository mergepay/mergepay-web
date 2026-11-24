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

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getStoredGroupPreferences(groupId: string): GroupPreferences {
  const storage = getStorage();
  if (!storage) return DEFAULT_GROUP_PREFERENCES;

  try {
    const raw = storage.getItem(STORAGE_KEY_PREFIX + groupId);
    if (!raw) return DEFAULT_GROUP_PREFERENCES;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        ...DEFAULT_GROUP_PREFERENCES,
        ...parsed,
      };
    }
  } catch {
    // Corrupted JSON or quota exceeded
  }

  return DEFAULT_GROUP_PREFERENCES;
}

export function setStoredGroupPreferences(groupId: string, prefs: Partial<GroupPreferences>): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    const current = getStoredGroupPreferences(groupId);
    const updated = { ...current, ...prefs };
    storage.setItem(STORAGE_KEY_PREFIX + groupId, JSON.stringify(updated));
  } catch {
    // Quota exceeded or storage disabled
  }
}
