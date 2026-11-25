"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { autoReconnectWallet, isFreighterAvailable } from "@/lib/stellar";
import { useWalletStore } from "@/lib/wallet-store";

export const WALLET_POLL_INTERVAL_MS = 30_000;

/**
 * Polls Freighter connectivity at a fixed interval while the user is
 * authenticated. Surfaces sonner toasts on disconnection and reconnection
 * transitions so the user is always informed of wallet status changes.
 */
export function useWalletConnectionMonitor(enabled: boolean): void {
  const setConnected = useWalletStore((s) => s.setConnected);
  const prevConnectedRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!enabled) {
      setConnected(null);
      prevConnectedRef.current = null;
      return;
    }

    let cancelled = false;

    async function check() {
      // Try silent auto-reconnect from session storage if available
      const result = await autoReconnectWallet();
      const available = await isFreighterAvailable();
      if (cancelled) return;

      const connected = result.success || available;
      setConnected(connected);

      // Toast on state transitions only — not every poll tick.
      if (prevConnectedRef.current !== null && prevConnectedRef.current !== connected) {
        if (connected) {
          toast.success("Wallet reconnected.", {
            description: "Your Freighter wallet is back online.",
          });
        } else {
          toast.error("Wallet disconnected.", {
            description: "Check your Freighter extension and reconnect.",
            duration: 10_000,
          });
        }
      }
      prevConnectedRef.current = connected;
    }

    void check();
    const interval = setInterval(() => void check(), WALLET_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, setConnected]);
}
