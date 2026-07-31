"use client";

import { useEffect } from "react";
import { isFreighterAvailable } from "@/lib/stellar";
import { useWalletStore } from "@/lib/wallet-store";

/**
 * How often the Freighter connection state is polled. Freighter does not
 * emit reliable disconnect events (a locked wallet or an inactive-tab
 * suspension is only observable by asking), so polling `isConnected()` is
 * the documented approach. 30s is cheap (a single extension IPC) and keeps
 * the worst-case stale-UI window small.
 */
export const WALLET_POLL_INTERVAL_MS = 30_000;

/**
 * Polls `freighterApi.isConnected()` every {@link WALLET_POLL_INTERVAL_MS}
 * and mirrors the result into the wallet store.
 *
 * The poll only runs while `enabled` (i.e. the user holds an authenticated
 * session — before login there is nothing to disconnect from). When
 * disabled, the store resets to "unknown" so no stale banner survives a
 * logout.
 *
 * Mount exactly once per session (see WalletDisconnectedBanner).
 */
export function useWalletConnectionMonitor(enabled: boolean): void {
  const setConnected = useWalletStore((s) => s.setConnected);

  useEffect(() => {
    if (!enabled) {
      setConnected(null);
      return;
    }

    let cancelled = false;

    async function check() {
      // isFreighterAvailable() never throws — it wraps isConnected() and
      // reports false when the extension is missing, locked, or unreachable.
      const connected = await isFreighterAvailable();
      if (!cancelled) setConnected(connected);
    }

    // Catch up immediately on mount/login, then poll.
    void check();
    const interval = setInterval(() => void check(), WALLET_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, setConnected]);
}
