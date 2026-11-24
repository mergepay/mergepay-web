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

export interface UserGroupFilterPreferences {
  activeGroupTab: string;
  sortOrder: string;
  transactionHistoryFilter: string;
}

export const DEFAULT_USER_GROUP_FILTER_PREFERENCES: UserGroupFilterPreferences = {
  activeGroupTab: "all",
  sortOrder: "date-desc",
  transactionHistoryFilter: "all",
};

const STORAGE_KEY = "mergepay:user_group_filter_preferences";

export function getStoredUserGroupFilterPreferences(): UserGroupFilterPreferences {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_USER_GROUP_FILTER_PREFERENCES;
  }
  try {
    const item = window.localStorage.getItem(STORAGE_KEY);
    if (!item) {
      return DEFAULT_USER_GROUP_FILTER_PREFERENCES;
    }
    const parsed = JSON.parse(item);
    return {
      ...DEFAULT_USER_GROUP_FILTER_PREFERENCES,
      ...parsed,
    };
  } catch (error) {
    console.error("Failed to load user group filter preferences from localStorage:", error);
    return DEFAULT_USER_GROUP_FILTER_PREFERENCES;
  }
}

export function setStoredUserGroupFilterPreferences(
  prefs: Partial<UserGroupFilterPreferences>
): UserGroupFilterPreferences {
  const current = getStoredUserGroupFilterPreferences();
  const updated = { ...current, ...prefs };
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error("Failed to save user group filter preferences to localStorage:", error);
    }
  }
  return updated;
}
