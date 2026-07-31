import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { User } from "../types";

/**
 * Storage boundary tests.
 *
 * The store is imported dynamically so a fake `localStorage` is in place
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
  // A legacy v1 record that still carries a bearer token.
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ state: { token: "leaked.jwt.value", user: USER }, version: 1 })
  );
  (globalThis as Record<string, unknown>).localStorage = storage;
  mod = await import("../auth-store");
  // Rehydration is scheduled by the middleware; let it settle.
  await mod.useAuth.persist.rehydrate();
});

function persistedState(): Record<string, unknown> {
  const raw = storage.getItem(STORAGE_KEY);
  assert.ok(raw, "expected the store to have written something");
  return JSON.parse(raw).state as Record<string, unknown>;
}

describe("auth store persistence (#113)", () => {
  it("never restores a token from storage", () => {
    assert.equal(mod.getToken(), null);
    assert.equal(mod.useAuth.getState().token, null);
  });

  it("drops a legacy persisted token instead of carrying it forward", () => {
    mod.useAuth.setState({ user: USER });
    void mod.useAuth.persist.rehydrate();
    assert.ok(!("token" in persistedState()));
  });

  it("treats a pre-timestamp session as unresumable", () => {
    // Migrated v1 records have no `lastAuthenticatedAt`, so they cannot
    // be aged and must not be silently resumed.
    assert.equal(mod.useAuth.getState().lastAuthenticatedAt, null);
  });

  it("writes only public wallet identity", () => {
    mod.useAuth.getState().setSession("live.jwt.value", USER);
    const state = persistedState();

    assert.deepEqual(Object.keys(state).sort(), [
      "lastAuthenticatedAt",
      "user",
    ]);
    assert.deepEqual(state.user, USER);
    assert.equal(typeof state.lastAuthenticatedAt, "string");

    // Nothing secret anywhere in the serialised payload.
    const raw = storage.getItem(STORAGE_KEY) ?? "";
    assert.ok(!raw.includes("live.jwt.value"));
    assert.ok(!raw.includes("leaked.jwt.value"));
    for (const forbidden of ["token", "xdr", "signedXdr", "transaction", "secret"]) {
      assert.ok(!raw.includes(forbidden), `expected no "${forbidden}" in storage`);
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

  it("keeps the identity on `clear` so the logged-out state stays recoverable", () => {
    mod.useAuth.getState().clear();
    assert.equal(mod.getToken(), null);
    assert.equal(mod.useAuth.getState().user, null);
  });

  it("drops the identity entirely on `forgetWallet`", () => {
    mod.useAuth.getState().setSession("another.jwt", USER);
    mod.useAuth.getState().forgetWallet();

    const state = mod.useAuth.getState();
    assert.equal(state.token, null);
    assert.equal(state.user, null);
    assert.equal(state.lastAuthenticatedAt, null);
    assert.equal(state.restoreStatus, "settled");
    assert.equal(mod.getPersistedSession(), null);
  });

  it("does not persist the observed wallet account", () => {
    mod.useAuth.getState().setSession("jwt", USER);
    mod.useAuth.getState().setActiveWalletPublicKey("GOBSERVED000000000000000000000000000000000000000000");
    assert.ok(!("activeWalletPublicKey" in persistedState()));
  });
});
