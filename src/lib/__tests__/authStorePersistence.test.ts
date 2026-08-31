import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { User } from "../types";

/**
 * Storage boundary tests.
 * 
 * The store is imported dynamically so a fake `sessionStorage` is in place
 * before the persist middleware reads it, which lets us assert on exactly
 * the bytes the app writes to the browser.
 */

const STORAGE_KEY = "mergepay.token";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  get length() {
    return this.map.size;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
}

const storage = new MemoryStorage();

const USER: User = {
  id: "u1",
  stellarPublicKey: "GABCSESSIONACCOUNT00000000000000000000000000000000000",
  displayName: "Ada",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

type AuthStoreModule = typeof import("../auth-store");
let mod: AuthStoreModule;

before(async () => {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ state: { token: "leaked.jwt.value", user: USER }, version: 1 })
  );
  (globalThis as Record<string, unknown>).sessionStorage = storage;
  (globalThis as Record<string, unknown>).localStorage = new MemoryStorage();
  mod = await import("../auth-store");
  await mod.useAuth.persist.rehydrate();
});

function persistedState(): Record<string, unknown> {
  const raw = storage.getItem(STORAGE_KEY);
  assert.ok(raw, "expected the store to have written something");
  return JSON.parse(raw).state as Record<string, unknown>;
}

describe("auth store session storage persistence (#113)", () => {
  it("never restores a token from storage", () => {
    assert.equal(mod.getToken(), null);
    assert.equal(mod.useAuth.getState().token, null);
  });

  it("writes only public wallet identity and lastAuthenticatedAt", () => {
    mod.useAuth.getState().setSession("live.jwt.value", USER);
    const state = persistedState();

    assert.deepEqual(Object.keys(state).sort(), [
      "lastAuthenticatedAt",
      "user",
    ]);
    assert.deepEqual(state.user, USER);
    assert.equal(typeof state.lastAuthenticatedAt, "string");

    const raw = storage.getItem(STORAGE_KEY) ?? "";
    assert.ok(!raw.includes("live.jwt.value"));
    for (const forbidden of ["token", "xdr", "signedXdr", "transaction", "secret"]) {
      assert.ok(!raw.includes(forbidden), `expected no \"${forbidden}\" in storage`);
    }
  });

  it("keeps the live token in memory only", () => {
    assert.equal(mod.getToken(), "live.jwt.value");
  });

  it("exposes the persisted identity in the restore shape", () => {
    const session = mod.getPersistedSession();
    assert.equal(session?.publicKey, USER.stellarPublicKey);
    assert.equal(typeof session?.lastAuthenticatedAt, "string");
  });

  it("drops the identity entirely on `forgetWallet`", () => {
    mod.useAuth.getState().setSession("another.jwt", USER);
    mod.useAuth.getState().forgetWallet();

    const state = mod.useAuth.getState();
    assert.equal(state.token, null);
    assert.equal(state.user, null);
    assert.equal(state.lastAuthenticatedAt, null);
    assert.equal(mod.getPersistedSession(), null);
  });
});
