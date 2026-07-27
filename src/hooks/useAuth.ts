"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { WatchWalletChanges } from "@stellar/freighter-api";
import { useAuth as useAuthStore } from "@/lib/auth-store";
import { loginWithWallet, logout as walletLogout, isFreighterAvailable } from "@/lib/stellar";
import { isSessionExpired, resetSessionExpired } from "@/lib/api";

export function useAuth() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);

  const isAuthenticated = !!token;

  const logout = useCallback(async () => {
    try {
      await walletLogout();
    } finally {
      queryClient.clear();
    }
  }, [queryClient]);

  const login = useCallback(async () => {
    const available = await isFreighterAvailable();
    if (!available) {
      toast.error("Freighter wallet not found. Please install it from freighter.app and refresh.");
      return;
    }

    setIsLoading(true);
    try {
      const loggedInUser = await loginWithWallet();
      resetSessionExpired();
      await queryClient.invalidateQueries();
      return loggedInUser;
    } catch (err: any) {
      if (err?.message) {
        toast.error(err.message);
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [queryClient]);

  useEffect(() => {
    if (hydrated && isSessionExpired() && !token) {
      router.replace("/login");
      toast.error("Session expired. Please sign in again.");
    }
  }, [hydrated, token, router]);

  // Watch for wallet account or network changes mid-session
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let watcher: WatchWalletChanges | null = null;
    try {
      watcher = new WatchWalletChanges(2000);
      watcher.watch((params) => {
        if (params.error) return;
        if (params.address && params.address !== user.stellarPublicKey) {
          toast.info("Wallet account changed. Logging out...");
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
    isAuthenticated,
    login,
    logout,
    isLoading,
  };
}
