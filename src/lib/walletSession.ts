/**
 * Wallet session continuity.
 *
 * The bearer token deliberately never reaches browser storage — see the
 * note in `src/lib/auth-store.ts`. That keeps a long-lived JWT out of
 * reach of an XSS payload, but it also means a reload drops the session
 * even though Freighter is still connected, and the app renders as
 * logged out while the wallet says otherwise.
 *
 * What *is* persisted is the public wallet identity: the public key, the
 * profile the API already returned for it, and when the session was last
 * established. None of it is secret, and none of it can be used to
 * authenticate on its own. On reload the app re-establishes the session
 * through the existing SEP-10 flow instead of restoring a stored
 * credential.
 *
 * This module holds the decision — what to do given what was persisted,
 * what the wallet currently reports, and whether a live token is already
 * in memory. It is pure, so every branch (reload, account change,
 * disconnect, expiry) is testable without a browser or an extension.
 */

/** Public, non-secret record of the last authenticated wallet. */
export interface PersistedWalletSession {
  /** Stellar public key the session was established for. */
  publicKey: string;
  /** ISO timestamp of the last successful authentication. */
  lastAuthenticatedAt: string | null;
}

/** What the wallet extension currently reports. Never includes secrets. */
export interface WalletSnapshot {
  /** `"checking"` until the first non-prompting probe resolves. */
  status: "checking" | "resolved" | "unavailable";
  /** Active public key, or `null` when no account is shared with the app. */
  publicKey: string | null;
}

export type SessionRestoreAction =
  /** The wallet has not answered yet — keep showing the restoring state. */
  | "wait"
  /** Nothing was persisted; the app is simply logged out. */
  | "none"
  /** A live token already covers the persisted identity. */
  | "restore"
  /** Same wallet, no live token — re-run the existing SEP-10 flow. */
  | "reauthenticate"
  /** The persisted session is too old to resume silently. */
  | "expired"
  /** Freighter is missing, locked, or no longer sharing an account. */
  | "await_wallet"
  /** A different account is active — the previous wallet's data must go. */
  | "account_changed";

/**
 * How long a persisted identity may be resumed without an explicit
 * sign-in. Past this the user connects again from the login screen, so a
 * shared or forgotten browser does not silently re-authenticate days
 * later.
 */
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface SessionRestoreInput {
  /** What was read back out of storage, if anything. */
  persisted: PersistedWalletSession | null;
  /** The wallet's current state. */
  wallet: WalletSnapshot;
  /** Public key the in-memory token belongs to, or `null` when there is none. */
  tokenPublicKey?: string | null;
  /** Clock, injected for tests. */
  now?: number;
  /** Override for {@link SESSION_MAX_AGE_MS}. */
  maxAgeMs?: number;
}

/**
 * Whether a persisted session is too old to resume without a fresh
 * sign-in. Unrelated to `isSessionExpired` in `src/lib/api.ts`, which
 * tracks whether a 401 has already been handled for the live token.
 */
export function isPersistedSessionExpired(
  lastAuthenticatedAt: string | null,
  now: number = Date.now(),
  maxAgeMs: number = SESSION_MAX_AGE_MS
): boolean {
  if (!lastAuthenticatedAt) return true;
  const at = Date.parse(lastAuthenticatedAt);
  if (Number.isNaN(at)) return true;
  // A timestamp from the future is a clock change or a tampered value;
  // treat it as unusable rather than trusting it indefinitely.
  if (at > now) return true;
  return now - at > maxAgeMs;
}

/**
 * Decide what the app should do with a persisted wallet identity.
 *
 * A live token wins immediately: an in-tab navigation must not trigger
 * another wallet round-trip. Otherwise the wallet is consulted, and the
 * persisted identity is only resumed when the extension still reports
 * exactly that account.
 */
export function decideSessionRestore(
  input: SessionRestoreInput
): SessionRestoreAction {
  const { persisted, wallet, tokenPublicKey = null } = input;

  if (!persisted?.publicKey) return "none";

  // Already authenticated for this identity — nothing to restore.
  if (tokenPublicKey && tokenPublicKey === persisted.publicKey) return "restore";

  // Too old to resume silently — the user signs in again explicitly.
  if (
    isPersistedSessionExpired(
      persisted.lastAuthenticatedAt,
      input.now ?? Date.now(),
      input.maxAgeMs ?? SESSION_MAX_AGE_MS
    )
  ) {
    return "expired";
  }

  if (wallet.status === "checking") return "wait";
  if (wallet.status === "unavailable") return "await_wallet";
  if (!wallet.publicKey) return "await_wallet";
  if (wallet.publicKey !== persisted.publicKey) return "account_changed";

  return "reauthenticate";
}

/**
 * Whether data cached for `previousPublicKey` must be dropped.
 *
 * Balances, groups and history are all scoped to the authenticated
 * account, so anything cached for the previous wallet is wrong the
 * moment the active account changes — and must not be shown to whoever
 * is behind the new one.
 */
export function shouldPurgeAccountData(
  previousPublicKey: string | null | undefined,
  nextPublicKey: string | null | undefined
): boolean {
  if (!previousPublicKey) return false;
  return previousPublicKey !== nextPublicKey;
}
