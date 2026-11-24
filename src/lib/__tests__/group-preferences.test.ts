import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getStoredGroupPreferences, setStoredGroupPreferences, DEFAULT_GROUP_PREFERENCES } from "../group-preferences";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  removeItem(key: string) { this.map.delete(key); }
  clear() { this.map.clear(); }
  get length() { return this.map.size; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
}

const storage = new MemoryStorage();
(globalThis as Record<string, unknown>).localStorage = storage;
(globalThis as Record<string, unknown>).window = globalThis;

beforeEach(() => {
  storage.clear();
});

describe("group-preferences persistence (#849)", () => {
  it("returns defaults when storage is empty", () => {
    const prefs = getStoredGroupPreferences("g1");
    assert.deepEqual(prefs, DEFAULT_GROUP_PREFERENCES);
  });

  it("persists and retrieves updated preferences", () => {
    setStoredGroupPreferences("g1", { activeTab: "balances", sortOrder: "oldest" });
    const prefs = getStoredGroupPreferences("g1");
    assert.equal(prefs.activeTab, "balances");
    assert.equal(prefs.sortOrder, "oldest");
  });

  it("handles corrupted json gracefully and falls back to defaults", () => {
    storage.setItem("mergepay:group_preferences:g1", "invalid-json");
    const prefs = getStoredGroupPreferences("g1");
    assert.deepEqual(prefs, DEFAULT_GROUP_PREFERENCES);
  });
});
