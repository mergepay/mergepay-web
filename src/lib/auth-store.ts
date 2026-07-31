"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User } from "./types";
import { TOKEN_STORAGE_KEY } from "./constants";
import type { PersistedWalletSession } from "./walletSession";

/** Phase of the one-time session restore that runs after rehydration. */
export type RestoreStatus = "pending" | "restoring" | "settled";

interface AuthState {
  token: string | null;
  user: User | null;
  /** ISO timestamp of the last successful SEP-10 authentication. */
  lastAuthenticatedAt: string | null;
  hydrated: boolean;
  /**
   * Public key Freighter currently reports, independent of the session.
   * Deliberately *not* persisted: it is an observation of the extension,
   * refreshed on every load and on every wallet change.
   */
  activeWalletPublicKey: string | null;
  /** Where the session restore has got to. Drives the loading UI. */
  restoreStatus: RestoreStatus;
  setSession: (token: string, user: User) => void;
  setUser: (user: User) => void;
  clear: () => void;
  /** Drop the persisted wallet identity as well as the live session. */
  forgetWallet: () => void;
  setHydrated: (v: boolean) => void;
  setRestoreStatus: (v: RestoreStatus) => void;
  setActiveWalletPublicKey: (v: string | null) => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      lastAuthenticatedAt: null,
      hydrated: false,
      activeWalletPublicKey: null,
      restoreStatus: "pending",
      setSession: (token, user) =>
        set({
          token,
          user,
          lastAuthenticatedAt: new Date().toISOString(),
          restoreStatus: "settled",
        }),
      setUser: (user) => set({ user }),
      /**
       * End the live session but keep the public wallet identity, so a
       * recoverable logged-out state can still name the wallet it was
       * for instead of starting from nothing.
       */
      clear: () => set({ token: null, user: null }),
      forgetWallet: () =>
        set({
          token: null,
          user: null,
          lastAuthenticatedAt: null,
          restoreStatus: "settled",
        }),
      setHydrated: (v) => set({ hydrated: v }),
      setRestoreStatus: (v) => set({ restoreStatus: v }),
      setActiveWalletPublicKey: (v) => set({ activeWalletPublicKey: v }),
    }),
    {
      name: TOKEN_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      /**
       * The bearer token is intentionally excluded from persistence.
       * It lives only in memory and is lost on page reload, which forces
       * a fresh SEP-10 wallet challenge. This prevents an XSS attacker
       * from reading a long-lived JWT out of localStorage.
       *
       * Residual risk: the token is readable from JS while the tab is open
       * (same as any in-memory value), but it cannot be exfiltrated across
       * sessions or by a script that runs after the tab is closed.
       *
       * What *is* persisted is public wallet identity only — the profile
       * (public key, display name, avatar) the API already returned, plus
       * when the session was last established so a stale one can be
       * refused. No private key, challenge, signed payload or transaction
       * envelope is ever written to storage, and nothing persisted here
       * can authenticate a request on its own.
       */
      partialize: (s) => ({
        user: s.user,
        lastAuthenticatedAt: s.lastAuthenticatedAt,
      }),
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        // v0 → v1: the old format stored { token, user }.
        // Drop the token field so it is no longer present in localStorage.
        const p = (persisted ?? {}) as Record<string, unknown>;
        const { token: _evicted, ...rest } = p;
        // v1 → v2: sessions written before the timestamp existed cannot be
        // aged, so they are treated as expired rather than resumed blindly.
        if (version < 2) return { ...rest, lastAuthenticatedAt: null };
        return rest;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);

/** Read the current JWT outside React (for the API client). */
export function getToken(): string | null {
  return useAuth.getState().token;
}

/**
 * The persisted wallet identity, in the shape the restore decision
 * expects. Returns `null` when nothing usable was stored.
 */
export function getPersistedSession(): PersistedWalletSession | null {
  const { user, lastAuthenticatedAt } = useAuth.getState();
  if (!user?.stellarPublicKey) return null;
  return { publicKey: user.stellarPublicKey, lastAuthenticatedAt };
}
