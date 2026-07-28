"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User } from "./types";
import { TOKEN_STORAGE_KEY } from "./constants";

interface AuthState {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  setSession: (token: string, user: User) => void;
  setUser: (user: User) => void;
  clear: () => void;
  setHydrated: (v: boolean) => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      hydrated: false,
      setSession: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, user: null }),
      setHydrated: (v) => set({ hydrated: v }),
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
       * The user profile (public key, display name, avatar) is persisted
       * because it contains no secrets and allows the UI to render without
       * an extra /me round-trip after re-authentication.
       */
      partialize: (s) => ({ user: s.user }),
      version: 1,
      migrate: (persisted: unknown) => {
        // v0 → v1: the old format stored { token, user }.
        // Drop the token field so it is no longer present in localStorage.
        const p = (persisted ?? {}) as Record<string, unknown>;
        const { token: _evicted, ...rest } = p;
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
