import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { User } from "./types";
import { TOKEN_STORAGE_KEY } from "./constants";
import { isPersistedSessionExpired } from "./walletSession";

export interface PersistedSession {
  publicKey: string;
  lastAuthenticatedAt: string | null;
}

export type WalletConnectionErrorCode =
  | "not_installed"
  | "locked"
  | "user_rejected"
  | "timeout"
  | "network"
  | "network_mismatch"
  | "unknown"
  | string;

export interface WalletConnectionError {
  code: WalletConnectionErrorCode;
  message: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  lastAuthenticatedAt: string | null;
  activeWalletPublicKey: string | null;
  restoreStatus: "idle" | "checking" | "settled";
  sessionExpired: boolean;
  walletError: WalletConnectionError | null;
  setSession: (token: string, user: User) => void;
  clear: () => void;
  forgetWallet: () => void;
  setActiveWalletPublicKey: (publicKey: string | null) => void;
  setRestoreStatus: (status: "idle" | "checking" | "settled") => void;
  setSessionExpired: (expired: boolean) => void;
  setWalletError: (error: WalletConnectionError | null) => void;
  clearWalletError: () => void;
}

/** Envelope shape this store writes; bumped with `SESSION_SCHEMA_VERSION`. */
export interface PersistedAuthState {
  user: User | null;
  lastAuthenticatedAt: string | null;
}

/**
 * Bumped whenever the persisted shape changes. A payload from another version
 * is dropped rather than migrated, because the only thing stored is a public
 * identity that a single click can re-establish.
 */
export const SESSION_SCHEMA_VERSION = 1;

let memoryToken: string | null = null;

/**
 * Is `value` a user object the app can safely read?
 *
 * Storage on an origin is writable by anything running on that origin, so a
 * rehydrated `user` is untrusted input. Every consumer reaches for
 * `user.stellarPublicKey` (and `.id`) directly, so a payload carrying a
 * non-string there would throw inside render — the crash this guards.
 */
export function isPersistedUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null) return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "string" &&
    user.id.length > 0 &&
    typeof user.stellarPublicKey === "string" &&
    user.stellarPublicKey.length > 0 &&
    typeof user.displayName === "string" &&
    (user.avatarUrl === null || typeof user.avatarUrl === "string") &&
    typeof user.createdAt === "string"
  );
}

/** A persisted `lastAuthenticatedAt` is either null or a parseable timestamp. */
function isPersistedTimestamp(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  return !Number.isNaN(Date.parse(value));
}

/**
 * Validate the inner state object zustand unwrapped from the envelope.
 *
 * `undefined` means "no entry written yet", which is a legitimate logged-out
 * state; anything else has to match {@link PersistedAuthState} exactly.
 */
export function isPersistedAuthState(value: unknown): value is PersistedAuthState {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  if (typeof state.user !== "undefined" && !isPersistedUser(state.user) && state.user !== null) {
    return false;
  }
  return (
    typeof state.lastAuthenticatedAt === "undefined" ||
    isPersistedTimestamp(state.lastAuthenticatedAt)
  );
}

/** Storage stub for SSR and for browsers that refuse storage access. */
function unavailableStorage(): StateStorage {
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

function browserLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Safari private mode and blocked-storage embedders throw on access.
    return null;
  }
}

/**
 * The auth store's persistence, as a `StateStorage` that refuses to hand back
 * a payload it cannot trust (#543).
 *
 * `getItem` is where corruption is detectable, so it is also where it is
 * repaired: an unparseable or mis-shaped entry is removed instead of being
 * rehydrated and left in storage to fail on every subsequent load. The public
 * identity moves to `localStorage` (from `sessionStorage`) so a reload keeps
 * the wallet address the login screen needs; the bearer token never reaches
 * either — see `partialize` below and the note in `walletSession.ts`.
 */
function createAuthSessionStorage(): StateStorage {
  const local = browserLocalStorage();
  if (!local) return unavailableStorage();
  return {
    getItem(name) {
      const raw = local.getItem(name);
      if (raw === null) return null;
      try {
        const envelope = JSON.parse(raw) as {
          state?: unknown;
          version?: unknown;
        };
        if (
          envelope.version !== SESSION_SCHEMA_VERSION ||
          !isPersistedAuthState(envelope.state)
        ) {
          local.removeItem(name);
          return null;
        }
      } catch {
        local.removeItem(name);
        return null;
      }
      return raw;
    },
    setItem: (name, value) => local.setItem(name, value),
    removeItem: (name) => local.removeItem(name),
  };
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      lastAuthenticatedAt: null,
      activeWalletPublicKey: null,
      restoreStatus: "idle",
      sessionExpired: false,
      walletError: null,
      setSession: (token: string, user: User) => {
        memoryToken = token;
        set({
          token,
          user,
          lastAuthenticatedAt: new Date().toISOString(),
          activeWalletPublicKey: user.stellarPublicKey,
          restoreStatus: "settled",
          sessionExpired: false,
          walletError: null,
        });
      },
      clear: () => {
        memoryToken = null;
        set({
          token: null,
          user: null,
          restoreStatus: "settled",
          sessionExpired: false,
          walletError: null,
        });
      },
      forgetWallet: () => {
        memoryToken = null;
        set({
          token: null,
          user: null,
          lastAuthenticatedAt: null,
          activeWalletPublicKey: null,
          restoreStatus: "settled",
          sessionExpired: false,
          walletError: null,
        });
      },
      setActiveWalletPublicKey: (publicKey: string | null) => {
        set({ activeWalletPublicKey: publicKey });
      },
      setRestoreStatus: (status: "idle" | "checking" | "settled") => {
        set({ restoreStatus: status });
      },
      setSessionExpired: (expired: boolean) => {
        set({ sessionExpired: expired });
      },
      setWalletError: (error: WalletConnectionError | null) => {
        set({ walletError: error });
      },
      clearWalletError: () => {
        set({ walletError: null });
      },
    }),
    {
      name: TOKEN_STORAGE_KEY,
      storage: createJSONStorage(() => createAuthSessionStorage()),
      version: SESSION_SCHEMA_VERSION,
      partialize: (state) => ({
        user: state.user,
        lastAuthenticatedAt: state.lastAuthenticatedAt,
      }),
      // `partialize` only guards the write side. zustand's default merge
      // spreads every key the payload happens to hold into the store, so a
      // hand-written `token` would arrive as an authenticated session and an
      // invented `sessionExpired` as a fact. Rebuilding from `current` and
      // taking only the two public fields makes the read side match.
      merge: (persisted, current) => {
        const payload = (persisted ?? {}) as Partial<PersistedAuthState>;
        const lastAuthenticatedAt = payload.lastAuthenticatedAt ?? null;
        return {
          ...current,
          user: isPersistedUser(payload.user) ? payload.user : null,
          lastAuthenticatedAt: isPersistedTimestamp(lastAuthenticatedAt)
            ? lastAuthenticatedAt
            : null,
        };
      },
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error || !state) {
            return;
          }
          const persistedUser = state.user;
          const lastAuth = state.lastAuthenticatedAt;
          if (persistedUser && lastAuth) {
            if (isPersistedSessionExpired(lastAuth)) {
              state.forgetWallet();
              return;
            }
            // The login screen names the account it would sign with; seeding it
            // from the persisted identity means the address is on screen from
            // the first paint instead of only after Freighter answers.
            state.setActiveWalletPublicKey(persistedUser.stellarPublicKey);
          }
        };
      },
    }
  )
);

export function getToken(): string | null {
  return memoryToken;
}

export function getPersistedSession(): PersistedSession | null {
  const state = useAuth.getState();
  if (!state.user) return null;
  return {
    publicKey: state.user.stellarPublicKey,
    lastAuthenticatedAt: state.lastAuthenticatedAt,
  };
}
