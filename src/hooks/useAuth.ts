"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { WatchWalletChanges } from "@stellar/freighter-api";
import { useAuth as useAuthStore } from "@/lib/auth-store";
import {
  loginWithWallet,
  logout as walletLogout,
  isFreighterAvailable,
  WalletNotInstalledError,
} from "@/lib/stellar";
import { shortKey } from "@/lib/format";
import { isSessionExpired, resetSessionExpired } from "@/lib/api";
import { clearClientSession } from "@/lib/sessionMonitor";
import { shouldPurgeAccountData } from "@/lib/walletSession";
import { track } from "@/lib/telemetry";

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
  const restoreStatus = useAuthStore((s) => s.restoreStatus);
  const walletError = useAuthStore((s) => s.walletError);
  const clearWalletError = useAuthStore((s) => s.clearWalletError);
  const setWalletError = useAuthStore((s) => s.setWalletError);

  const isAuthenticated = !!token;
  /** True until the persisted session has been resolved one way or another. */
  const restoring = restoreStatus !== "settled";

  const logout = useCallback(async () => {
    try {
      await walletLogout();
    } finally {
      // Groups, balances and history are all scoped to the authenticated
      // account, so nothing cached may survive into the next session.
      queryClient.clear();
      clearClientSession();
    }
  }, [queryClient]);

  const login = useCallback(async () => {
    // Detect if Freighter extension is installed before invoking connection hooks
    const available = await isFreighterAvailable();
    if (!available) {
      const err = new WalletNotInstalledError();
      useAuthStore.getState().setWalletError({
        code: "not_installed",
        message: err.message,
      });
      throw err;
    }

    setIsLoading(true);
    try {
      useAuthStore.getState().clearWalletError();
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
          track("wallet_disconnected", { reason: "disconnected" });
          toast.info("Wallet disconnected. Logging out...");
          logout();
        } else if (action === "changed") {
          track("wallet_disconnected", { reason: "account_changed" });
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
    restoring,
    isAuthenticated,
    walletError,
    setWalletError,
    clearWalletError,
    login,
    logout,
    isLoading,
  };
}
