import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_USER_GROUP_FILTER_PREFERENCES,
  getStoredUserGroupFilterPreferences,
  setStoredUserGroupFilterPreferences,
} from "../storage";

describe("user group filter storage utilities", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default preferences when storage is empty", () => {
    const prefs = getStoredUserGroupFilterPreferences();
    expect(prefs).toEqual(DEFAULT_USER_GROUP_FILTER_PREFERENCES);
  });

  it("saves and loads group tabs, sort orders, and transaction filters correctly", () => {
    setStoredUserGroupFilterPreferences({
      activeGroupTab: "settlements",
      sortOrder: "amount-desc",
      transactionHistoryFilter: "pending",
    });
    const prefs = getStoredUserGroupFilterPreferences();
    expect(prefs.activeGroupTab).toBe("settlements");
    expect(prefs.sortOrder).toBe("amount-desc");
    expect(prefs.transactionHistoryFilter).toBe("pending");
  });

  it("handles corrupted JSON gracefully", () => {
    localStorage.setItem("mergepay:user_group_filter_preferences", "{bad-json}");
    const prefs = getStoredUserGroupFilterPreferences();
    expect(prefs).toEqual(DEFAULT_USER_GROUP_FILTER_PREFERENCES);
  });
});
