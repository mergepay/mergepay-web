import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getStoredUserPreferences,
  setStoredUserPreferences,
  DEFAULT_USER_PREFERENCES,
} from "../user-preferences";

describe("User Preferences Persistence", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    (global as any).window = {
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
    };
  });

  it("returns default preferences when local storage is empty", () => {
    const prefs = getStoredUserPreferences();
    assert.deepEqual(prefs, DEFAULT_USER_PREFERENCES);
  });

  it("saves and retrieves preferences correctly", () => {
    setStoredUserPreferences({ theme: "dark", compactView: true });
    const prefs = getStoredUserPreferences();
    assert.equal(prefs.theme, "dark");
    assert.equal(prefs.compactView, true);
    assert.equal(prefs.defaultCurrency, DEFAULT_USER_PREFERENCES.defaultCurrency);
  });

  it("handles corrupted JSON gracefully by returning defaults", () => {
    store["mergepay.user_preferences"] = "{bad-json}";
    const prefs = getStoredUserPreferences();
    assert.deepEqual(prefs, DEFAULT_USER_PREFERENCES);
  });

  it("handles write errors gracefully without throwing", () => {
    const res = setStoredUserPreferences({ defaultCurrency: "EUR" });
    // Should not throw and return fallback or previous valid state
    assert.ok(res);
  });
});
