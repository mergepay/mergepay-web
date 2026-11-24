import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getStoredNotificationPreferences,
  setStoredNotificationPreferences,
  getStoredGroupPreferences,
  setStoredGroupPreferences,
  getStoredFilterPreferences,
  setStoredFilterPreferences,
} from "../storage";

describe("storage utilities", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("manages notification preferences", () => {
    const prefs = getStoredNotificationPreferences();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);

    setStoredNotificationPreferences({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      pushEnabled: true,
    });
    expect(getStoredNotificationPreferences().pushEnabled).toBe(true);
  });

  it("manages group preferences", () => {
    setStoredGroupPreferences({ activeGroupTab: "overview", sortOrder: "asc" });
    const prefs = getStoredGroupPreferences();
    expect(prefs.activeGroupTab).toBe("overview");
    expect(prefs.sortOrder).toBe("asc");
  });

  it("manages filter preferences", () => {
    setStoredFilterPreferences({ transactionFilter: "ALL" });
    const prefs = getStoredFilterPreferences();
    expect(prefs.transactionFilter).toBe("ALL");
  });
});
