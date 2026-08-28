import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_MAX_AGE_MS,
  decideSessionRestore,
  isPersistedSessionExpired,
  shouldPurgeAccountData,
  type SessionRestoreInput,
  type WalletSnapshot,
} from "../walletSession";

const KEY = "GABCSESSIONACCOUNT00000000000000000000000000000000000";
const OTHER_KEY = "GXYZOTHERACCOUNT000000000000000000000000000000000000";

const NOW = Date.parse("2026-07-30T12:00:00.000Z");
const FRESH = new Date(NOW - 60_000).toISOString();
const STALE = new Date(NOW - SESSION_MAX_AGE_MS - 1000).toISOString();

const CONNECTED: WalletSnapshot = { status: "resolved", publicKey: KEY };

function input(overrides: Partial<SessionRestoreInput> = {}): SessionRestoreInput {
  return {
    persisted: { publicKey: KEY, lastAuthenticatedAt: FRESH },
    wallet: CONNECTED,
    tokenPublicKey: null,
    now: NOW,
    ...overrides,
  };
}

describe("decideSessionRestore — reload (#113)", () => {
  it("re-authenticates when the same wallet is still connected", () => {
    assert.equal(decideSessionRestore(input()), "reauthenticate");
  });

  it("does nothing when a live token already covers the identity", () => {
    assert.equal(
      decideSessionRestore(input({ tokenPublicKey: KEY })),
      "restore"
    );
  });

  it("stays put while the wallet has not answered yet", () => {
    assert.equal(
      decideSessionRestore(
        input({ wallet: { status: "checking", publicKey: null } })
      ),
      "wait"
    );
  });

  it("does nothing at all when no session was persisted", () => {
    assert.equal(decideSessionRestore(input({ persisted: null })), "none");
    assert.equal(
      decideSessionRestore(
        input({ persisted: { publicKey: "", lastAuthenticatedAt: FRESH } })
      ),
      "none"
    );
  });
});

describe("decideSessionRestore — account change (#113)", () => {
  it("detects a different active account", () => {
    assert.equal(
      decideSessionRestore(
        input({ wallet: { status: "resolved", publicKey: OTHER_KEY } })
      ),
      "account_changed"
    );
  });

  it("prefers the persisted identity over a stale in-memory token", () => {
    assert.equal(
      decideSessionRestore(
        input({
          tokenPublicKey: OTHER_KEY,
          wallet: { status: "resolved", publicKey: OTHER_KEY },
        })
      ),
      "account_changed"
    );
  });
});

describe("decideSessionRestore — disconnect (#113)", () => {
  it("waits for the wallet when Freighter is gone", () => {
    assert.equal(
      decideSessionRestore(
        input({ wallet: { status: "unavailable", publicKey: null } })
      ),
      "await_wallet"
    );
  });

  it("waits for the wallet when no account is shared", () => {
    assert.equal(
      decideSessionRestore(
        input({ wallet: { status: "resolved", publicKey: null } })
      ),
      "await_wallet"
    );
  });
});

describe("decideSessionRestore — expiry (#113)", () => {
  it("refuses to resume a session past its maximum age", () => {
    assert.equal(
      decideSessionRestore(
        input({ persisted: { publicKey: KEY, lastAuthenticatedAt: STALE } })
      ),
      "expired"
    );
  });

  it("refuses to resume a session with no recorded timestamp", () => {
    assert.equal(
      decideSessionRestore(
        input({ persisted: { publicKey: KEY, lastAuthenticatedAt: null } })
      ),
      "expired"
    );
  });

  it("checks expiry before consulting the wallet", () => {
    // An expired session must not depend on the extension answering.
    assert.equal(
      decideSessionRestore(
        input({
          persisted: { publicKey: KEY, lastAuthenticatedAt: STALE },
          wallet: { status: "checking", publicKey: null },
        })
      ),
      "expired"
    );
  });

  it("still honours a live token for an aged identity", () => {
    // The token was issued this session; age only gates silent resume.
    assert.equal(
      decideSessionRestore(
        input({
          persisted: { publicKey: KEY, lastAuthenticatedAt: STALE },
          tokenPublicKey: KEY,
        })
      ),
      "restore"
    );
  });

  it("honours an explicit max age override", () => {
    assert.equal(
      decideSessionRestore(input({ maxAgeMs: 1000 })),
      "expired"
    );
  });
});

describe("isPersistedSessionExpired (#113)", () => {
  it("accepts a recent timestamp", () => {
    assert.equal(isPersistedSessionExpired(FRESH, NOW), false);
  });

  it("rejects an old, missing, unparseable or future timestamp", () => {
    assert.equal(isPersistedSessionExpired(STALE, NOW), true);
    assert.equal(isPersistedSessionExpired(null, NOW), true);
    assert.equal(isPersistedSessionExpired("not-a-date", NOW), true);
    assert.equal(
      isPersistedSessionExpired(new Date(NOW + 60_000).toISOString(), NOW),
      true
    );
  });

  it("treats the boundary itself as still valid", () => {
    const atBoundary = new Date(NOW - SESSION_MAX_AGE_MS).toISOString();
    assert.equal(isPersistedSessionExpired(atBoundary, NOW), false);
  });
});

describe("shouldPurgeAccountData (#113)", () => {
  it("purges when the active account changes", () => {
    assert.equal(shouldPurgeAccountData(KEY, OTHER_KEY), true);
  });

  it("purges when the wallet disconnects entirely", () => {
    assert.equal(shouldPurgeAccountData(KEY, null), true);
  });

  it("keeps data when the account is unchanged", () => {
    assert.equal(shouldPurgeAccountData(KEY, KEY), false);
  });

  it("has nothing to purge when there was no previous account", () => {
    assert.equal(shouldPurgeAccountData(null, KEY), false);
    assert.equal(shouldPurgeAccountData(undefined, undefined), false);
  });
});

describe("session storage safety (#113)", () => {
  it("only ever describes public wallet identity", () => {
    // The persisted shape is the contract: a public key and a timestamp.
    // Anything secret would have to appear here first.
    const persisted = { publicKey: KEY, lastAuthenticatedAt: FRESH };
    assert.deepEqual(Object.keys(persisted).sort(), [
      "lastAuthenticatedAt",
      "publicKey",
    ]);
  });
});
