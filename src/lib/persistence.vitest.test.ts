import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  setStoredNotificationPreferences,
} from "./storage";
import {
  DEFAULT_HISTORY_VIEW,
  readHistoryView,
  writeHistoryView,
} from "./history-view";
import type { User } from "./types";

/**
 * Re-import a persisted store the way a page reload does: fresh module graph,
 * rehydrated from whatever is currently in storage (#494).
 */
async function reloadGroupStore() {
  vi.resetModules();
  return (await import("./group-store")).useGroupStore;
}

async function reloadFiatPreference() {
  vi.resetModules();
  return (await import("./fiat-preference")).useFiatPreference;
}

const ACTIVE_USER: User = {
  id: "u-1",
  stellarPublicKey: "GACTIVEPUBLICKEY",
  displayName: "Ada",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

/**
 * Field names that must never appear in anything written to localStorage.
 * Compared against a normalised key (`lowercased`, separators stripped).
 */
const FORBIDDEN_FIELDS = [
  "token",
  "secret",
  "secretkey",
  "privatekey",
  "password",
  "passphrase",
  "mnemonic",
  "seedphrase",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "signingkey",
  "credential",
];

function normalise(key: string): string {
  return key.toLowerCase().replace(/[_\-\s.]/g, "");
}

/** Depth-first walk collecting every object key in a parsed JSON value. */
function collectKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      out.add(key);
      collectKeys(child, out);
    }
  }
  return out;
}

function storageEntries(): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const value = localStorage.getItem(key);
    if (value !== null) entries.push([key, value]);
  }
  return entries;
}

describe("persistence behaviour (#494)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps the active group selection across a reload", async () => {
    const before = await reloadGroupStore();
    before.getState().setSelectedGroup("group-42");

    expect(localStorage.getItem("mergepay.selectedGroup")).toContain("group-42");

    const after = await reloadGroupStore();
    expect(after.getState().selectedGroupId).toBe("group-42");
    expect(after.getState().recentGroupIds).toContain("group-42");
  });

  it("keeps display preferences across a reload", async () => {
    const fiatBefore = await reloadFiatPreference();
    fiatBefore.getState().setPreferredCurrency("EUR");

    setStoredNotificationPreferences({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      pushEnabled: true,
      expenseSettled: false,
    });

    expect(localStorage.getItem("mergepay:fiat-preference")).toContain("EUR");
    expect(localStorage.getItem("mergepay:notification_preferences")).toContain(
      "true"
    );

    const fiatAfter = await reloadFiatPreference();
    expect(fiatAfter.getState().preferredCurrency).toBe("EUR");

    const { getStoredNotificationPreferences } = await import("./storage");
    expect(getStoredNotificationPreferences()).toEqual({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      pushEnabled: true,
      expenseSettled: false,
    });
  });

  it("keeps the history tab and filters across a reload", () => {
    writeHistoryView({
      kind: "expenses",
      filters: { kind: "expenses", assetCode: "USDC", keyword: "lunch" },
    });

    expect(localStorage.getItem("mergepay.historyView")).toContain("USDC");

    // A reload re-reads the same storage, so the view comes back as it was.
    expect(readHistoryView()).toEqual({
      kind: "expenses",
      filters: { kind: "expenses", assetCode: "USDC", keyword: "lunch" },
    });
  });

  it("falls back to the default history view for unusable payloads", () => {
    localStorage.setItem("mergepay.historyView", "{not json");
    expect(readHistoryView()).toEqual(DEFAULT_HISTORY_VIEW);

    localStorage.setItem(
      "mergepay.historyView",
      JSON.stringify({ kind: 42, filters: { kind: "settlements", keyword: 7 } })
    );
    expect(readHistoryView()).toEqual({
      kind: "all",
      filters: { kind: "settlements" },
    });

    localStorage.setItem("mergepay.historyView", JSON.stringify("nope"));
    expect(readHistoryView()).toEqual(DEFAULT_HISTORY_VIEW);
  });

  it("falls back to defaults when storage is unavailable", async () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      value: undefined,
      configurable: true,
    });
    try {
      const { getStoredNotificationPreferences } = await import("./storage");
      expect(getStoredNotificationPreferences()).toEqual(
        DEFAULT_NOTIFICATION_PREFERENCES
      );
      // Never throws when the store itself is gone.
      expect(() =>
        setStoredNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES)
      ).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });

  it("never writes wallet secrets, private keys, or tokens to localStorage", async () => {
    vi.resetModules();
    const { useGroupStore } = await import("./group-store");
    const { useFiatPreference } = await import("./fiat-preference");
    const { useAssetStore } = await import("./asset-store");
    const { useGroupBudgetStore } = await import("./group-budget-store");
    const { useAuth } = await import("./auth-store");

    useGroupStore.getState().setSelectedGroup("group-1");
    useFiatPreference.getState().setPreferredCurrency("GBP");
    useAssetStore.getState().setActiveAsset({ code: "USDC", issuer: "GAAB" });
    useGroupBudgetStore.getState().setBudget("group-1", 500, "USD");
    setStoredNotificationPreferences({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      pushEnabled: true,
    });
    writeHistoryView({
      kind: "expenses",
      filters: { kind: "expenses", keyword: "groceries" },
    });

    const JWT = "super-secret-jwt-token-value";
    useAuth.getState().setSession(JWT, ACTIVE_USER);

    const entries = storageEntries();
    expect(entries.length).toBeGreaterThan(0);

    for (const [key, value] of entries) {
      expect(
        FORBIDDEN_FIELDS.includes(normalise(key)),
        `localStorage key "${key}" looks sensitive`
      ).toBe(false);

      let parsed: unknown = value;
      try {
        parsed = JSON.parse(value);
      } catch {
        // Non-JSON payloads are still scanned as raw text below.
      }

      if (typeof parsed === "string") {
        expect(parsed).not.toContain(JWT);
        continue;
      }

      for (const field of collectKeys(parsed)) {
        expect(
          FORBIDDEN_FIELDS.includes(normalise(field)),
          `field "${field}" under "${key}" looks sensitive`
        ).toBe(false);
      }
      expect(value).not.toContain(JWT);
    }

    // The auth store's own key is `mergepay.token`, and #543 deliberately
    // persists the *public* identity there so a reload keeps the wallet
    // address the login screen shows. What must never appear is the
    // credential: the bearer token lives in memory only.
    const sessionEntry = localStorage.getItem("mergepay.token");
    expect(sessionEntry).not.toBeNull();
    expect(sessionEntry).not.toContain(JWT);
    expect(Object.keys(JSON.parse(sessionEntry ?? "{}").state).sort()).toEqual([
      "lastAuthenticatedAt",
      "user",
    ]);
  });
});
