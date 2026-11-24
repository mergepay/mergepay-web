export interface NotificationPreferencesState {
  pushEnabled: boolean;
  expenseAdded: boolean;
  expenseSettled: boolean;
  expenseRequested: boolean;
}

const NOTIFICATION_STORAGE_KEY = "mergepay:notification_preferences";

export interface FilterPreferences {
  activeGroupTab: string;
  sortOrder: string;
  transactionFilter: string;
}

export const DEFAULT_FILTER_PREFERENCES: FilterPreferences = {
  activeGroupTab: "all",
  sortOrder: "newest",
  transactionFilter: "all",
};

const STORAGE_KEY = "mergepay:filter_preferences";

export function getStoredFilterPreferences(): FilterPreferences {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_FILTER_PREFERENCES;
  }
  try {
    const item = window.localStorage.getItem(STORAGE_KEY);
    if (!item) {
      return DEFAULT_FILTER_PREFERENCES;
    }
    const parsed = JSON.parse(item);
    return {
      activeGroupTab: typeof parsed.activeGroupTab === "string" ? parsed.activeGroupTab : DEFAULT_FILTER_PREFERENCES.activeGroupTab,
      sortOrder: typeof parsed.sortOrder === "string" ? parsed.sortOrder : DEFAULT_FILTER_PREFERENCES.sortOrder,
      transactionFilter: typeof parsed.transactionFilter === "string" ? parsed.transactionFilter : DEFAULT_FILTER_PREFERENCES.transactionFilter,
    };
  } catch {
    return DEFAULT_FILTER_PREFERENCES;
  }
}

export function setStoredFilterPreferences(prefs: FilterPreferences): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore quota exceeded or storage disabled errors
  }
}

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
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
  try {
    const item = window.localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (!item) {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }
    const parsed = JSON.parse(item);
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...parsed,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export function setStoredNotificationPreferences(prefs: NotificationPreferencesState): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore quota exceeded or storage disabled errors
  }
}
