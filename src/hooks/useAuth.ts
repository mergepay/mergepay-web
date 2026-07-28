"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { WatchWalletChanges } from "@stellar/freighter-api";
import { useAuth as useAuthStore } from "@/lib/auth-store";
import { loginWithWallet, logout as walletLogout } from "@/lib/stellar";
import { shortKey } from "@/lib/format";
import { isSessionExpired, resetSessionExpired } from "@/lib/api";
import { shouldPurgeAccountData } from "@/lib/walletSession";

export type WalletChangeAction = "none" | "disconnected" | "changed";

/**
 * Pure decision for how to react to a `WatchWalletChanges` tick.
 * Extracted so account-change / disconnect logic is unit-testable without
 * mocking the Freighter watcher or React lifecycle.
 */
export function walletChangeAction(
  params: { address: string; error?: unknown },
  currentPublicKey: string
): WalletChangeAction {
  if (params.error || !params.address) return "disconnected";
  if (params.address !== currentPublicKey) return "changed";
  return "none";
}

export function useAuth() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const restoreStatus = useAuthStore((s) => s.restoreStatus);

  const isAuthenticated = !!token;
  /** True until the persisted session has been resolved one way or another. */
  const restoring = !hydrated || restoreStatus !== "settled";

  const logout = useCallback(async () => {
    try {
      await walletLogout();
    } finally {
      // Groups, balances and history are all scoped to the authenticated
      // account, so nothing cached may survive into the next session.
      queryClient.clear();
      useAuthStore.getState().forgetWallet();
    }
  }, [queryClient]);

  const login = useCallback(async () => {
    setIsLoading(true);
    try {
      const loggedInUser = await loginWithWallet();
      resetSessionExpired();
      await queryClient.invalidateQueries();
      return loggedInUser;
    } catch (err) {
      // Error display is owned by the caller (via the central error
      // handler) so a failure is never toasted twice.
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [queryClient]);

  // Watch for wallet account or network changes mid-session
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let watcher: WatchWalletChanges | null = null;
    try {
      watcher = new WatchWalletChanges(2000);
      watcher.watch((params) => {
        // The displayed wallet identity follows the extension, whether or
        // not a session survives the change.
        useAuthStore.getState().setActiveWalletPublicKey(params.address || null);
        const action = walletChangeAction(params, user.stellarPublicKey);
        if (action === "disconnected") {
          toast.info("Wallet disconnected. Logging out...");
          logout();
        } else if (action === "changed") {
          // The displayed public key follows the wallet immediately, then
          // the previous account's data is dropped before anything else
          // can render against it.
          if (shouldPurgeAccountData(user.stellarPublicKey, params.address)) {
            toast.info(
              `Wallet account changed to ${shortKey(params.address)}. Sign in again to continue.`
            );
          }
          logout();
        }
      });
    } catch {
      // Ignore watcher initialization errors gracefully
    }

    return () => {
      if (watcher) {
        try {
          watcher.stop();
        } catch {
          // Cleanup fallback
        }
      }
    };
  }, [isAuthenticated, user, logout]);

  return {
    user,
    token,
    hydrated,
    restoring,
    isAuthenticated,
    login,
    logout,
    isLoading,
  };
}
