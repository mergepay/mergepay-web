"use client";

import { useEffect } from "react";
import { autoReconnectWallet, isFreighterAvailable } from "@/lib/stellar";
import { useWalletStore } from "@/lib/wallet-store";

export const WALLET_POLL_INTERVAL_MS = 30_000;

export function useWalletConnectionMonitor(enabled: boolean): void {
  const setConnected = useWalletStore((s) => s.setConnected);

  useEffect(() => {
    if (!enabled) {
      setConnected(null);
      return;
    }

    let cancelled = false;

    async function check() {
      // Try silent auto-reconnect from session storage if available
      await autoReconnectWallet();
      const connected = await isFreighterAvailable();
      if (!cancelled) setConnected(connected);
    }

    void check();
    const interval = setInterval(() => void check(), WALLET_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, setConnected]);
}
