import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User } from "./types";
import { isPersistedSessionExpired, shouldPurgeAccountData } from "./walletSession";

export interface PersistedSession {
  publicKey: string;
  lastAuthenticatedAt: string | null;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  lastAuthenticatedAt: string | null;
  activeWalletPublicKey: string | null;
  restoreStatus: "idle" | "checking" | "settled";
  setSession: (token: string, user: User) => void;
  clear: () => void;
  forgetWallet: () => void;
  setActiveWalletPublicKey: (publicKey: string | null) => void;
  setRestoreStatus: (status: "idle" | "checking" | "settled") => void;
}

const SESSION_STORAGE_KEY = "mergepay.token";

let memoryToken: string | null = null;

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      lastAuthenticatedAt: null,
      activeWalletPublicKey: null,
      restoreStatus: "idle",
      setSession: (token: string, user: User) => {
        memoryToken = token;
        set({
          token,
          user,
          lastAuthenticatedAt: new Date().toISOString(),
          restoreStatus: "settled",
        });
      },
      clear: () => {
        memoryToken = null;
        set({
          token: null,
          user: null,
          restoreStatus: "settled",
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
        });
      },
      setActiveWalletPublicKey: (publicKey: string | null) => {
        set({ activeWalletPublicKey: publicKey });
      },
      setRestoreStatus: (status: "idle" | "checking" | "settled") => {
        set({ restoreStatus: status });
      },
    }),
    {
      name: SESSION_STORAGE_KEY,
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return window.sessionStorage;
      }),
      partialize: (state) => ({
        user: state.user,
        lastAuthenticatedAt: state.lastAuthenticatedAt,
      }),
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
            }
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
