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

export interface GroupPreferencesState {
  activeTab: string;
  sortOrder: string;
  historyFilters: Record<string, unknown>;
}

export const DEFAULT_GROUP_PREFERENCES: GroupPreferencesState = {
  activeTab: "overview",
  sortOrder: "newest",
  historyFilters: {},
};

const GROUP_PREFERENCES_STORAGE_KEY_PREFIX = "mergepay:group_preferences:";

export function getStoredGroupPreferences(groupId: string): GroupPreferencesState {
  if (typeof window === "undefined") {
    return DEFAULT_GROUP_PREFERENCES;
  }
  try {
    const raw = localStorage.getItem(`${GROUP_PREFERENCES_STORAGE_KEY_PREFIX}${groupId}`);
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

export function setStoredGroupPreferences(groupId: string, prefs: Partial<GroupPreferencesState>): GroupPreferencesState {
  if (typeof window === "undefined") {
    return DEFAULT_GROUP_PREFERENCES;
  }
  try {
    const current = getStoredGroupPreferences(groupId);
    const next = { ...current, ...prefs };
    localStorage.setItem(`${GROUP_PREFERENCES_STORAGE_KEY_PREFIX}${groupId}`, JSON.stringify(next));
    return next;
  } catch {
    return getStoredGroupPreferences(groupId);
  }
}
