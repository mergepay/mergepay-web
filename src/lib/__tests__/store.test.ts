import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { User } from "../types";
import { TOKEN_STORAGE_KEY } from "../constants";
import { SESSION_MAX_AGE_MS } from "../walletSession";

/**
 * Session persistence and recovery for the auth store (#543).
 *
 * The store is imported dynamically so a fake `localStorage` is in place
 * before the persist middleware reads it — `createJSONStorage` evaluates its
 * storage at module scope, so the order matters. Everything below then drives
 * the one real code path a page reload takes: write bytes to storage, hand
 * them back through `rehydrate()`, and check what the app believes.
 *
 * The two properties that make that safe are that only public identity is
 * written, and that a payload which is not public identity — corrupt,
 * hand-edited, or from a schema this build does not understand — is cleared
 * rather than trusted.
 */

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

const local = new MemoryStorage();
const session = new MemoryStorage();
(globalThis as Record<string, unknown>).localStorage = local;
// The store no longer reads sessionStorage; a decoy proves nothing lands there.
(globalThis as Record<string, unknown>).sessionStorage = session;
// The storage factory only trusts `window.localStorage` (an SSR render must not
// touch it), and node:test has no `window` — so the fake is installed as one,
// the same way the other storage-boundary tests here do it.
(globalThis as Record<string, unknown>).window = globalThis;

type AuthStoreModule = typeof import("../auth-store");
let mod: AuthStoreModule;

before(async () => {
  mod = await import("../auth-store");
});

const USER: User = {
  id: "u1",
  stellarPublicKey: "GABCSESSIONACCOUNT00000000000000000000000000000000000",
  displayName: "Ada",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const state = () => mod.useAuth.getState();

/** Wrap a persisted state object the way zustand's persist middleware does. */
function envelope(persisted: unknown, version: number): string {
  return JSON.stringify({ state: persisted, version });
}

/** The current schema version, read from the module under test. */
function currentVersion(): number {
  return mod.SESSION_SCHEMA_VERSION;
}

/** Simulate a reload: reset memory, put `raw` in storage, rehydrate from it. */
async function rehydrateFrom(raw: string | null): Promise<void> {
  state().forgetWallet();
  local.clear();
  if (raw !== null) local.setItem(TOKEN_STORAGE_KEY, raw);
  await mod.useAuth.persist?.rehydrate();
}

function persistedRaw(): string | null {
  return local.getItem(TOKEN_STORAGE_KEY);
}

beforeEach(() => {
  state().forgetWallet();
  local.clear();
  session.clear();
});

describe("auth store persistence (#543)", () => {
  it("writes the session identity to localStorage, not sessionStorage", async () => {
    state().setSession("live.jwt.value", USER);

    assert.ok(persistedRaw(), "expected the session to be persisted");
    assert.equal(session.getItem(TOKEN_STORAGE_KEY), null);
  });

  it("persists only public identity — never the bearer token", async () => {
    state().setSession("live.jwt.value", USER);

    const raw = persistedRaw() ?? "";
    const written = JSON.parse(raw).state as Record<string, unknown>;
    assert.deepEqual(Object.keys(written).sort(), ["lastAuthenticatedAt", "user"]);
    assert.deepEqual(written.user, USER);
    assert.equal(typeof written.lastAuthenticatedAt, "string");
    for (const forbidden of ["live.jwt.value", "token", "secret", "xdr"]) {
      assert.ok(!raw.includes(forbidden), `expected no "${forbidden}" in storage`);
    }
    assert.equal(mod.getToken(), "live.jwt.value", "the token stays in memory");
  });

  it("re-hydrates the public key and session status on reload", async () => {
    await rehydrateFrom(
      envelope({ user: USER, lastAuthenticatedAt: new Date().toISOString() }, currentVersion())
    );

    assert.deepEqual(state().user, USER);
    assert.equal(state().activeWalletPublicKey, USER.stellarPublicKey);
    assert.equal(mod.getPersistedSession()?.publicKey, USER.stellarPublicKey);
    // Restoring a session must not mint a token that was never issued here.
    assert.equal(state().token, null);
    assert.equal(mod.getToken(), null);
  });

  it("keeps a session inside the age budget and drops one past it", async () => {
    const now = Date.now();

    await rehydrateFrom(
      envelope(
        {
          user: USER,
          lastAuthenticatedAt: new Date(now - SESSION_MAX_AGE_MS + 60_000).toISOString(),
        },
        currentVersion()
      )
    );
    assert.deepEqual(state().user, USER);

    await rehydrateFrom(
      envelope(
        {
          user: USER,
          lastAuthenticatedAt: new Date(now - SESSION_MAX_AGE_MS - 60_000).toISOString(),
        },
        currentVersion()
      )
    );
    assert.equal(state().user, null);
    assert.equal(state().lastAuthenticatedAt, null);
    assert.equal(mod.getToken(), null);
  });

  it("drops a timestamp from the future instead of trusting it", async () => {
    await rehydrateFrom(
      envelope(
        {
          user: USER,
          lastAuthenticatedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        currentVersion()
      )
    );
    assert.equal(state().user, null);
  });

  it("leaves a logged-out payload alone", async () => {
    await rehydrateFrom(
      envelope({ user: null, lastAuthenticatedAt: null }, currentVersion())
    );
    assert.equal(state().user, null);
    assert.equal(state().activeWalletPublicKey, null);
  });

  it("restores only the two public fields, never a credential or a flag", async () => {
    // Storage is writable by anything on the origin, so a payload can carry
    // keys the store never writes: a bearer token (which would make
    // `isAuthenticated` true without a login), `sessionExpired`, or a
    // pre-settled `restoreStatus`. None of them may reach the store.
    await rehydrateFrom(
      envelope(
        {
          user: USER,
          lastAuthenticatedAt: new Date().toISOString(),
          token: "forged.jwt.value",
          sessionExpired: true,
          restoreStatus: "idle",
        },
        currentVersion()
      )
    );

    assert.equal(state().token, null);
    assert.equal(mod.getToken(), null);
    assert.equal(state().sessionExpired, false);
    assert.deepEqual(state().user, USER);
  });
});

describe("corrupt and untrusted storage payloads (#543)", () => {
  const unusable: Array<[string, string]> = [
    ["truncated JSON", '{"state":{"user":'],
    ["not JSON at all", "session-storage-was-hand-edited"],
    ["a bare array", JSON.stringify([USER])],
    ["a JSON string", JSON.stringify("MP:dinner-8f3a")],
    ["a null payload", "null"],
  ];

  for (const [label, raw] of unusable) {
    it(`clears ${label} rather than rehydrating it`, async () => {
      await rehydrateFrom(raw);

      assert.equal(state().user, null);
      assert.equal(state().token, null);
      assert.equal(persistedRaw(), null, "the unusable entry must be removed");
    });
  }

  it("clears a payload whose user is not shaped like a user", async () => {
    // The crash this prevents: readers do `state.user.stellarPublicKey`, so a
    // non-string there breaks every screen that renders the address.
    const forgeries = [
      { user: { ...USER, stellarPublicKey: 42 }, lastAuthenticatedAt: null },
      { user: { ...USER, id: "" }, lastAuthenticatedAt: null },
      { user: { ...USER, displayName: undefined }, lastAuthenticatedAt: null },
      { user: { ...USER, avatarUrl: 0 }, lastAuthenticatedAt: null },
      { user: "GABC", lastAuthenticatedAt: null },
      { user: [], lastAuthenticatedAt: null },
      { user: USER, lastAuthenticatedAt: "yesterday" },
      { user: USER, lastAuthenticatedAt: 1_700_000_000_000 },
    ];

    for (const forged of forgeries) {
      await rehydrateFrom(envelope(forged, currentVersion()));
      assert.equal(state().user, null, JSON.stringify(forged));
      assert.equal(persistedRaw(), null, JSON.stringify(forged));
    }
  });

  it("clears a payload written by a schema this build does not understand", async () => {
    await rehydrateFrom(
      envelope(
        { user: USER, lastAuthenticatedAt: null },
        currentVersion() + 1
      )
    );
    assert.equal(state().user, null);
    assert.equal(persistedRaw(), null);
  });

  it("clears a payload with no version at all", async () => {
    await rehydrateFrom(JSON.stringify({ state: { user: USER } }));
    assert.equal(state().user, null);
    assert.equal(persistedRaw(), null);
  });

  it("survives an empty storage without touching it", async () => {
    await rehydrateFrom(null);
    assert.equal(state().user, null);
    assert.equal(persistedRaw(), null);
  });

  it("never throws while clearing, whatever was stored", async () => {
    for (const raw of ["", " ", "{}", "[]", '{"state":null}', "undefined"]) {
      await rehydrateFrom(raw);
      assert.equal(state().user, null, raw);
    }
  });
});

describe("forgetWallet and logout", () => {
  it("removes the persisted identity", async () => {
    state().setSession("live.jwt.value", USER);
    assert.ok(persistedRaw());

    state().forgetWallet();

    assert.equal(state().user, null);
    assert.equal(state().lastAuthenticatedAt, null);
    assert.equal(state().activeWalletPublicKey, null);
    assert.equal(mod.getPersistedSession(), null);
    assert.equal(mod.getToken(), null);

    // A reload after logout must not resurrect the previous account.
    await rehydrateFrom(persistedRaw());
    assert.equal(state().user, null);
  });

  it("clear() drops the token and user but keeps the wallet for re-auth", async () => {
    // `clear()` is what an expired session hits (`lib/api.ts`); the login
    // screen still has to name the account it would sign with again, so the
    // wallet key survives there while the bearer token does not.
    state().setSession("live.jwt.value", USER);
    state().clear();

    assert.equal(state().token, null);
    assert.equal(mod.getToken(), null);
    assert.equal(state().user, null);
    assert.equal(state().activeWalletPublicKey, USER.stellarPublicKey);

    // And it writes an entry that a reload reads back as logged out.
    await rehydrateFrom(persistedRaw());
    assert.equal(state().user, null);
    assert.equal(mod.getPersistedSession(), null);
  });
});

describe("isPersistedUser", () => {
  it("accepts the shape the API returns", async () => {
    assert.equal(mod.isPersistedUser(USER), true);
    assert.equal(
      mod.isPersistedUser({ ...USER, avatarUrl: "https://example.test/a.png" }),
      true
    );
  });

  it("rejects anything a selector would crash on", async () => {
    for (const value of [
      null,
      undefined,
      0,
      "GABC",
      [],
      {},
      { ...USER, id: 1 },
      { ...USER, createdAt: 5 },
    ]) {
      assert.equal(mod.isPersistedUser(value), false, JSON.stringify(value));
    }
  });
});

describe("isPersistedAuthState", () => {
  it("treats an absent payload as logged out, not corrupt", async () => {
    assert.equal(mod.isPersistedAuthState(undefined), true);
    assert.equal(mod.isPersistedAuthState({ user: null, lastAuthenticatedAt: null }), true);
  });

  it("requires a usable timestamp when one is present", async () => {
    assert.equal(
      mod.isPersistedAuthState({ user: null, lastAuthenticatedAt: "2026-01-01T00:00:00.000Z" }),
      true
    );
    assert.equal(mod.isPersistedAuthState({ user: null, lastAuthenticatedAt: "soon" }), false);
    assert.equal(mod.isPersistedAuthState({ user: null, lastAuthenticatedAt: 12 }), false);
  });

  it("rejects a payload that is not an object", async () => {
    assert.equal(mod.isPersistedAuthState("user"), false);
    assert.equal(mod.isPersistedAuthState(null), false);
  });
});

describe("auth store wallet error state (#716)", () => {
  it("initializes with walletError as null", () => {
    assert.equal(state().walletError, null);
  });

  it("sets and clears wallet error state", () => {
    state().setWalletError({
      code: "locked",
      message: "Freighter wallet is locked",
    });
    assert.deepEqual(state().walletError, {
      code: "locked",
      message: "Freighter wallet is locked",
    });

    state().clearWalletError();
    assert.equal(state().walletError, null);
  });

  it("resets walletError when setSession is called", () => {
    state().setWalletError({
      code: "not_installed",
      message: "Freighter not found",
    });
    assert.ok(state().walletError !== null);

    state().setSession("live.jwt.value", USER);
    assert.equal(state().walletError, null);
  });

  it("resets walletError on clear and forgetWallet", () => {
    state().setWalletError({ code: "timeout", message: "timed out" });
    state().clear();
    assert.equal(state().walletError, null);

    state().setWalletError({ code: "timeout", message: "timed out" });
    state().forgetWallet();
    assert.equal(state().walletError, null);
  });
});

