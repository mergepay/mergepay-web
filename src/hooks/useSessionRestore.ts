"use client";

import { useEffect } from "react";
import { useAuth, getPersistedSession } from "../lib/auth-store";
import { useWalletStore } from "../lib/wallet-store";
import { getAddress, isConnected } from "@stellar/freighter-api";
import { toast } from "sonner";

/**
 * Automatically checks session persistence and verifies Freighter connection status on app load.
 * Resets store state and notifies via `sonner` toast if the wallet disconnected or account switched.
 */
export function useSessionRestore() {
  const { user, forgetWallet, setRestoreStatus, restoreStatus } = useAuth();

  useEffect(() => {
    if (restoreStatus !== "idle") return;

    async function restore() {
      setRestoreStatus("checking");
      const persisted = getPersistedSession();

      if (!persisted || !persisted.publicKey) {
        setRestoreStatus(
          "settled"
        );
        return;
      }

      try {
        const connected = await isConnected();
        if (!connected) {
          toast.error("Freighter wallet is disconnected or locked.");
          forgetWallet();
          useWalletStore.getState().setConnected(false);
          return;
        }

        const currentAddress = await getAddress();
        if (!currentAddress) {
          toast.error("No Freighter account granted. Please reconnect.");
          forgetWallet();
          useWalletStore.getState().setConnected(false);
          return;
        }

        if (currentAddress !== persisted.publicKey) {
          toast.error("Freighter account switched. Please sign in again.");
          forgetWallet();
          useWalletStore.getState().setConnected(false);
          return;
        }

        useWalletStore.getState().setConnected(true);
        setRestoreStatus("settled");
      } catch (err) {
        console.error("Failed to restore wallet session:", err);
        forgetWallet();
        useWalletStore.getState().setConnected(false);
      }
    }

    void restore();
  }, [restoreStatus, forgetWallet, setRestoreStatus]);
}
