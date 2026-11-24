import { describe, it, expect, beforeEach } from "vitest";
import {
  getStoredGroupPreferences,
  setStoredGroupPreferences,
  DEFAULT_GROUP_PREFERENCES,
  getStoredFilterPreferences,
  setStoredFilterPreferences,
  DEFAULT_FILTER_PREFERENCES,
} from "./storage";

describe("Storage Preferences Persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default group preferences when storage is empty", () => {
    const prefs = getStoredGroupPreferences();
    expect(prefs).toEqual(DEFAULT_GROUP_PREFERENCES);
  });

  it("saves and loads group preferences correctly", () => {
    setStoredGroupPreferences({ activeTab: "active", sortOrder: "oldest" });
    const prefs = getStoredGroupPreferences();
    expect(prefs.activeTab).toBe("active");
    expect(prefs.sortOrder).toBe("oldest");
  });

  it("handles corrupted JSON in localStorage gracefully for group preferences", () => {
    localStorage.setItem("mergepay:group_preferences", "invalid-json{");
    const prefs = getStoredGroupPreferences();
    expect(prefs).toEqual(DEFAULT_GROUP_PREFERENCES);
  });

  it("returns default filter preferences when storage is empty", () => {
    const prefs = getStoredFilterPreferences();
    expect(prefs).toEqual(DEFAULT_FILTER_PREFERENCES);
  });

  it("saves and loads transaction history filter preferences correctly", () => {
    setStoredFilterPreferences({ transactionSearch: "coffee", transactionStatus: "pending" });
    const prefs = getStoredFilterPreferences();
    expect(prefs.transactionSearch).toBe("coffee");
    expect(prefs.transactionStatus).toBe("pending");
  });

  it("handles corrupted JSON in localStorage gracefully for filter preferences", () => {
    localStorage.setItem("mergepay:filter_preferences", "invalid-json{");
    const prefs = getStoredFilterPreferences();
    expect(prefs).toEqual(DEFAULT_FILTER_PREFERENCES);
  });
});
