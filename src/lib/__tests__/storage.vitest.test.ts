import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  setStoredNotificationPreferences,
  getStoredNotificationPreferences,
  DEFAULT_GROUP_PREFERENCES,
  getStoredGroupPreferences,
  setStoredGroupPreferences,
} from "../storage";

describe("Storage Utility (Vitest)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default notification preferences when storage is empty", () => {
    const prefs = getStoredNotificationPreferences();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("persists and retrieves notification preferences correctly", () => {
    setStoredNotificationPreferences({
      pushEnabled: true,
      expenseAdded: false,
      expenseSettled: true,
      expenseRequested: false,
    });
    const prefs = getStoredNotificationPreferences();
    expect(prefs.pushEnabled).toBe(true);
    expect(prefs.expenseAdded).toBe(false);
  });

  it("returns default group preferences when storage is empty", () => {
    const prefs = getStoredGroupPreferences();
    expect(prefs).toEqual(DEFAULT_GROUP_PREFERENCES);
  });

  it("persists and retrieves group preferences correctly", () => {
    setStoredGroupPreferences({ activeTab: "active", sortOrder: "amount" });
    const prefs = getStoredGroupPreferences();
    expect(prefs.activeTab).toBe("active");
    expect(prefs.sortOrder).toBe("amount");
  });

  it("handles corrupted JSON gracefully by returning defaults", () => {
    localStorage.setItem("mergepay:group_preferences", "{bad-json}");
    const prefs = getStoredGroupPreferences();
    expect(prefs).toEqual(DEFAULT_GROUP_PREFERENCES);
  });
});
