export interface NotificationPreferencesState {
  pushEnabled: boolean;
  expenseAdded: boolean;
  expenseSettled: boolean;
  expenseRequested: boolean;
}

export interface GroupPreferencesState {
  activeGroupTab?: string;
  sortOrder?: string;
  transactionFilter?: string;
  historyFilters?: any;
  [key: string]: any;
}

export interface FilterPreferencesState {
  activeGroupTab?: string;
  sortOrder?: string;
  transactionFilter?: string;
  [key: string]: any;
}

export const DEFAULT_GROUP_PREFERENCES: GroupPreferencesState = {
  activeGroupTab: "overview",
  sortOrder: "newest",
  transactionFilter: "all",
};

export const DEFAULT_FILTER_PREFERENCES: FilterPreferencesState = {
  activeGroupTab: "overview",
  sortOrder: "newest",
  transactionFilter: "all",
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesState = {
  pushEnabled: false,
  expenseAdded: true,
  expenseSettled: true,
  expenseRequested: true,
};

const NOTIFICATION_STORAGE_KEY = "mergepay:notification_preferences";
const GROUP_PREFERENCES_STORAGE_KEY = "mergepay:group_preferences";
const FILTER_PREFERENCES_STORAGE_KEY = "mergepay:filter_preferences";

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

export function getStoredGroupPreferences(): GroupPreferencesState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(GROUP_PREFERENCES_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function setStoredGroupPreferences(prefs: Partial<GroupPreferencesState>): void {
  if (typeof window === "undefined") return;
  try {
    const current = getStoredGroupPreferences();
    localStorage.setItem(GROUP_PREFERENCES_STORAGE_KEY, JSON.stringify({ ...current, ...prefs }));
  } catch {
    // ignore
  }
}

export function getStoredFilterPreferences(): FilterPreferencesState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(FILTER_PREFERENCES_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function setStoredFilterPreferences(prefs: Partial<FilterPreferencesState>): void {
  if (typeof window === "undefined") return;
  try {
    const current = getStoredFilterPreferences();
    localStorage.setItem(FILTER_PREFERENCES_STORAGE_KEY, JSON.stringify({ ...current, ...prefs }));
  } catch {
    // ignore
  }
}
