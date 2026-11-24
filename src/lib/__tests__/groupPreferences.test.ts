import { describe, it, beforeEach } from "vitest";
import {
  getStoredGroupPreferences,
  setStoredGroupPreferences,
  DEFAULT_GROUP_PREFERENCES,
} from "../group-preferences";

describe("Group Preferences Persistence", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    (globalThis as any).window = {
      localStorage: {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          if (key.includes("quota-exceeded")) {
            throw new Error("QuotaExceededError");
          }
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
      },
    };
  });

  it("returns default preferences when local storage is empty", () => {
    const prefs = getStoredGroupPreferences("g-1");
    expect(prefs).toEqual(DEFAULT_GROUP_PREFERENCES);
  });

  it("saves and retrieves group preferences correctly", () => {
    setStoredGroupPreferences("g-1", { activeTab: "members", sortOrder: "amount" });
    const prefs = getStoredGroupPreferences("g-1");
    expect(prefs.activeTab).toBe("members");
    expect(prefs.sortOrder).toBe("amount");
  });

  it("handles corrupted JSON gracefully by returning defaults", () => {
    store["mergepay:group_preferences:g-1"] = "{bad-json}";
    const prefs = getStoredGroupPreferences("g-1");
    expect(prefs).toEqual(DEFAULT_GROUP_PREFERENCES);
  });

  it("handles write errors gracefully without throwing", () => {
    const res = setStoredGroupPreferences("quota-exceeded", { activeTab: "expenses" });
    expect(res).toBeDefined();
  });
});
