/**
 * Browser-only, versioned persistence for dashboard display preferences.
 * Malformed values and blocked storage are treated as absent.
 */
export type GroupTab = "all" | "active" | "archived";
export type SortOrder = "newest" | "oldest" | "name-asc" | "name-desc";
export type TransactionFilter = "all" | "expenses" | "settlements" | "treasury";

export interface DashboardPreferences {
  activeGroupTab: GroupTab;
  groupSortOrder: SortOrder;
  transactionFilter: TransactionFilter;
}

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  activeGroupTab: "all",
  groupSortOrder: "newest",
  transactionFilter: "all",
};

const STORAGE_PREFIX = "mergepay:dashboard-preferences:v1";

export function dashboardPreferencesKey(userId?: string): string {
  // A separate namespace prevents one signed-in user inheriting another's settings.
  return `${STORAGE_PREFIX}:${encodeURIComponent(userId || "anonymous")}`;
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.includes(value as T);
}

export function validateDashboardPreferences(value: unknown): DashboardPreferences {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    activeGroupTab: isOneOf(raw.activeGroupTab, ["all", "active", "archived"])
      ? raw.activeGroupTab : DEFAULT_DASHBOARD_PREFERENCES.activeGroupTab,
    groupSortOrder: isOneOf(raw.groupSortOrder, ["newest", "oldest", "name-asc", "name-desc"])
      ? raw.groupSortOrder : DEFAULT_DASHBOARD_PREFERENCES.groupSortOrder,
    transactionFilter: isOneOf(raw.transactionFilter, ["all", "expenses", "settlements", "treasury"])
      ? raw.transactionFilter : DEFAULT_DASHBOARD_PREFERENCES.transactionFilter,
  };
}

export function loadDashboardPreferences(userId?: string): DashboardPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_DASHBOARD_PREFERENCES };
  try {
    const stored = window.localStorage.getItem(dashboardPreferencesKey(userId));
    return stored === null ? { ...DEFAULT_DASHBOARD_PREFERENCES }
      : validateDashboardPreferences(JSON.parse(stored) as unknown);
  } catch {
    return { ...DEFAULT_DASHBOARD_PREFERENCES };
  }
}

export function saveDashboardPreferences(
  preferences: DashboardPreferences,
  userId?: string,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      dashboardPreferencesKey(userId),
      JSON.stringify(validateDashboardPreferences(preferences)),
    );
    return true;
  } catch {
    // SecurityError, quota exceeded or disabled storage: keep in-memory state.
    return false;
  }
}
