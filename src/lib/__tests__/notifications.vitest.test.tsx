import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getStoredNotificationPreferences,
  setStoredNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "../storage";

describe("Notification Preferences Storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default preferences when storage is empty", () => {
    const prefs = getStoredNotificationPreferences();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("saves and retrieves preferences correctly", () => {
    const custom = {
      pushEnabled: true,
      expenseAdded: false,
      expenseSettled: true,
      expenseRequested: false,
    };
    setStoredNotificationPreferences(custom);
    const retrieved = getStoredNotificationPreferences();
    expect(retrieved).toEqual(custom);
  });
});
