import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getLocalStorageDraft,
  saveLocalStorageDraft,
  clearLocalStorageDraft,
} from "../useLocalStorageDraft";

describe("LocalStorageDraft Utils", () => {
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

  it("persists draft to local storage", () => {
    saveLocalStorageDraft("draft-1", { amount: "100" });
    assert.equal(store["draft-1"], '{"amount":"100"}');
  });

  it("retrieves and parses draft from local storage", () => {
    store["draft-2"] = '{"title":"Test"}';
    const { restored, data } = getLocalStorageDraft<{ title: string }>("draft-2");
    assert.equal(restored, true);
    assert.deepEqual(data, { title: "Test" });
  });

  it("returns null if no draft exists", () => {
    const { restored, data } = getLocalStorageDraft("missing-draft");
    assert.equal(restored, false);
    assert.equal(data, null);
  });

  it("clears draft from local storage", () => {
    store["draft-3"] = '{"foo":"bar"}';
    clearLocalStorageDraft("draft-3");
    assert.equal(store["draft-3"], undefined);
  });

  it("handles corrupted JSON gracefully", () => {
    store["draft-bad"] = "{bad-json}";
    const { restored, data } = getLocalStorageDraft("draft-bad");
    assert.equal(restored, false);
    assert.equal(data, null);
  });

  it("handles quota exceeded error gracefully on save", () => {
    // Should not throw
    saveLocalStorageDraft("quota-exceeded", { large: "data" });
    assert.equal(store["quota-exceeded"], undefined);
  });
});
