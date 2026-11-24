import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getStoredNotificationPreferences,
  setStoredNotificationPreferences,
  DEFAULT_FILTER_PREFERENCES,
  getStoredFilterPreferences,
  setStoredFilterPreferences,
} from "../storage";

describe("Storage persistence utilities", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          if (key === "quota-exceeded") {
            throw new Error("QuotaExceededError");
          }
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
      },
    });
  });

  it("returns default notification preferences when storage is empty", () => {
    const prefs = getStoredNotificationPreferences();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("saves and retrieves notification preferences correctly", () => {
    setStoredNotificationPreferences({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      pushEnabled: true,
    });
    const prefs = getStoredNotificationPreferences();
    expect(prefs.pushEnabled).toBe(true);
  });

  it("handles corrupted JSON gracefully by returning defaults for notifications", () => {
    store["mergepay:notification_preferences"] = "{bad-json}";
    const prefs = getStoredNotificationPreferences();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("returns default filter preferences when storage is empty", () => {
    const prefs = getStoredFilterPreferences();
    expect(prefs).toEqual(DEFAULT_FILTER_PREFERENCES);
  });

  it("saves and retrieves active group tabs, sort orders, and transaction history filters correctly", () => {
    setStoredFilterPreferences({
      activeGroupTab: "settled",
      sortOrder: "oldest",
      transactionFilter: "expenses",
    });
    const prefs = getStoredFilterPreferences();
    expect(prefs.activeGroupTab).toBe("settled");
    expect(prefs.sortOrder).toBe("oldest");
    expect(prefs.transactionFilter).toBe("expenses");
  });

  it("handles corrupted JSON gracefully by returning defaults for filters", () => {
    store["mergepay:filter_preferences"] = "{bad-json}";
    const prefs = getStoredFilterPreferences();
    expect(prefs).toEqual(DEFAULT_FILTER_PREFERENCES);
  });
});
