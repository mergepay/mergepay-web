import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { safeGetItem, safeSetItem, getGroupPreferences, setGroupPreferences, DEFAULT_GROUP_PREFERENCES, STORAGE_KEY_PREFIX } from "../storage.js";

describe("storage utility test suite", () => {
  beforeEach(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it("returns default value when item is missing or localStorage is unavailable", () => {
    const val = safeGetItem("non-existent-key", "default-val");
    assert.strictEqual(val, "default-val");
  });

  it("correctly saves and retrieves values with JSON parsing", () => {
    safeSetItem("test-key", { foo: "bar" });
    const val = safeGetItem("test-key", { foo: "default" });
    assert.deepStrictEqual(val, { foo: "bar" });
  });

  it("gets and sets group preferences correctly with defaults", () => {
    const prefs = getGroupPreferences("group-123");
    assert.deepStrictEqual(prefs, DEFAULT_GROUP_PREFERENCES);

    const newPrefs = { activeTab: "members", sortOrder: "amount-asc", transactionFilter: "expenses" };
    setGroupPreferences("group-123", newPrefs);

    const retrieved = getGroupPreferences("group-123");
    assert.deepStrictEqual(retrieved, newPrefs);
  });
});
