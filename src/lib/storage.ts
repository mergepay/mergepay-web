export interface NotificationPreferencesState {
  pushEnabled: boolean;
  expenseAdded: boolean;
  expenseSettled: boolean;
  expenseRequested: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesState = {
  pushEnabled: false,
  expenseAdded: true,
  expenseSettled: true,
  expenseRequested: true,
};

const NOTIFICATION_STORAGE_KEY = "mergepay:notification_preferences";

export function getStoredNotificationPreferences(): NotificationPreferencesState {
  if (typeof window === "undefined") {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
  try {
    const raw = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...parsed,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export function setStoredNotificationPreferences(prefs: NotificationPreferencesState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage quota / private mode exceptions
  }
}

export function safeGetItem<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined" || !window.localStorage) {
    return defaultValue;
  }
  try {
    const item = window.localStorage.getItem(key);
    if (item === null) {
      return defaultValue;
    }
    return JSON.parse(item) as T;
  } catch {
    return defaultValue;
  }
}

export function safeSetItem<T>(key: string, value: T): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota or disabled storage errors
  }
}

export interface GroupFilterPreferences {
  activeTab: string;
  activeGroupTab?: string;
  sortOrder: string;
  transactionFilter?: string;
  transactionSearch?: string;
  transactionStatus?: string;
  historyFilters?: Record<string, unknown>;
}

export const DEFAULT_GROUP_PREFERENCES: GroupFilterPreferences = {
  activeTab: "overview",
  sortOrder: "date-desc",
  transactionFilter: "all",
};

export const DEFAULT_FILTER_PREFERENCES = DEFAULT_GROUP_PREFERENCES;

export const STORAGE_KEY_PREFIX = "mergepay:";

export function getGroupPreferences(groupId: string): GroupFilterPreferences {
  return safeGetItem<GroupFilterPreferences>(
    `${STORAGE_KEY_PREFIX}group_prefs:${groupId}`,
    DEFAULT_GROUP_PREFERENCES
  );
}

export function setGroupPreferences(groupId: string, prefs: GroupFilterPreferences): void {
  safeSetItem(`${STORAGE_KEY_PREFIX}group_prefs:${groupId}`, prefs);
}

export function getStoredGroupPreferences(groupId = "default"): GroupFilterPreferences {
  return getGroupPreferences(groupId);
}

export function setStoredGroupPreferences(groupId = "default", prefs: Partial<GroupFilterPreferences>): void {
  const current = getGroupPreferences(groupId);
  safeSetItem(`${STORAGE_KEY_PREFIX}group_prefs:${groupId}`, { ...current, ...prefs });
}

export const getStoredFilterPreferences = () => getGroupPreferences("default");
export const setStoredFilterPreferences = (prefs: Partial<GroupFilterPreferences>) => setStoredGroupPreferences("default", prefs);
