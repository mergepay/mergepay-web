import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DASHBOARD_PREFERENCES,
  dashboardPreferencesKey,
  loadDashboardPreferences,
  saveDashboardPreferences,
  validateDashboardPreferences,
} from "../dashboard-preferences";

describe("dashboard preference persistence", () => {
  it("returns defaults on the server", () => {
    assert.deepEqual(loadDashboardPreferences(), DEFAULT_DASHBOARD_PREFERENCES);
    assert.equal(saveDashboardPreferences(DEFAULT_DASHBOARD_PREFERENCES), false);
  });

  it("validates corrupted and unsupported values", () => {
    assert.deepEqual(validateDashboardPreferences(null), DEFAULT_DASHBOARD_PREFERENCES);
    assert.deepEqual(validateDashboardPreferences({ activeGroupTab: "broken" }), DEFAULT_DASHBOARD_PREFERENCES);
    assert.equal(validateDashboardPreferences({ transactionFilter: "expenses" }).transactionFilter, "expenses");
  });

  it("namespaces preferences per user", () => {
    assert.notEqual(dashboardPreferencesKey("alice"), dashboardPreferencesKey("bob"));
    assert.match(dashboardPreferencesKey("alice"), /^mergepay:/);
  });

  it("recovers from invalid JSON and blocked storage", () => {
    const previous = (globalThis as { window?: unknown }).window;
    const values = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
      },
    };
    try {
      values.set(dashboardPreferencesKey("a"), "{invalid");
      assert.deepEqual(loadDashboardPreferences("a"), DEFAULT_DASHBOARD_PREFERENCES);
      const changed = { ...DEFAULT_DASHBOARD_PREFERENCES, activeGroupTab: "archived" as const };
      assert.equal(saveDashboardPreferences(changed, "a"), true);
      assert.deepEqual(loadDashboardPreferences("a"), changed);
      (globalThis as { window?: unknown }).window = {
        localStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } },
      };
      assert.deepEqual(loadDashboardPreferences("a"), DEFAULT_DASHBOARD_PREFERENCES);
      assert.equal(saveDashboardPreferences(changed, "a"), false);
    } finally {
      if (previous === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window?: unknown }).window = previous;
    }
  });
});
