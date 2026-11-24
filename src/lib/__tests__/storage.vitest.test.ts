import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getStoredNotificationPreferences,
  setStoredNotificationPreferences,
  DEFAULT_GROUP_PREFERENCES,
  getStoredGroupPreferences,
  setStoredGroupPreferences,
} from "../storage";

describe("storage persistence utility", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default notification preferences when storage is empty", () => {
    const prefs = getStoredNotificationPreferences();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("saves and loads notification preferences correctly", () => {
    const customPrefs = {
      pushEnabled: true,
      expenseAdded: false,
      expenseSettled: true,
      expenseRequested: false,
    };
    setStoredNotificationPreferences(customPrefs);
    expect(getStoredNotificationPreferences()).toEqual(customPrefs);
  });

  it("handles corrupted JSON gracefully for notification preferences", () => {
    localStorage.setItem("mergepay:notification_preferences", "invalid-json");
    const prefs = getStoredNotificationPreferences();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("returns default group preferences when storage is empty", () => {
    const groupPrefs = getStoredGroupPreferences("group-123");
    expect(groupPrefs).toEqual(DEFAULT_GROUP_PREFERENCES);
  });

  it("saves and loads group preferences correctly", () => {
    const customGroupPrefs = {
      activeTab: "members",
      sortOrder: "oldest",
      historyFilters: { kind: "expenses" },
    };
    setStoredGroupPreferences("group-123", customGroupPrefs);
    expect(getStoredGroupPreferences("group-123")).toEqual(customGroupPrefs);
  });

  it("handles corrupted JSON gracefully for group preferences", () => {
    localStorage.setItem("mergepay:group_preferences:group-123", "invalid-json");
    const groupPrefs = getStoredGroupPreferences("group-123");
    expect(groupPrefs).toEqual(DEFAULT_GROUP_PREFERENCES);
  });

  it("handles storage quota exceeded or disabled storage safely", () => {
    const originalSetItem = localStorage.setItem;
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    // Should not throw
    const result = setStoredGroupPreferences("group-123", { activeTab: "settings" });
    expect(result).toEqual(DEFAULT_GROUP_PREFERENCES);

    vi.restoreAllMocks();
  });
});
