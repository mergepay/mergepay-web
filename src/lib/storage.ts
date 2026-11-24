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

const GROUP_PREFERENCES_STORAGE_KEY = "mergepay:group_preferences";

export interface GroupPreferencesState {
  activeTab?: string;
  sortOrder?: string;
  historyFilters?: Record<string, unknown>;
}

export const DEFAULT_GROUP_PREFERENCES: GroupPreferencesState = {
  activeTab: "all",
  sortOrder: "recent",
  historyFilters: {},
};

export function getStoredGroupPreferences(): GroupPreferencesState {
  if (typeof window === "undefined") {
    return DEFAULT_GROUP_PREFERENCES;
  }
  try {
    const raw = localStorage.getItem(GROUP_PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_GROUP_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_GROUP_PREFERENCES,
      ...(typeof parsed === "object" && parsed !== null ? parsed : {}),
    };
  } catch {
    return DEFAULT_GROUP_PREFERENCES;
  }
}

export function setStoredGroupPreferences(prefs: Partial<GroupPreferencesState>): GroupPreferencesState {
  if (typeof window === "undefined") {
    return DEFAULT_GROUP_PREFERENCES;
  }
  try {
    const current = getStoredGroupPreferences();
    const next = { ...current, ...prefs };
    localStorage.setItem(GROUP_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return getStoredGroupPreferences();
  }
}
