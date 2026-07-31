"use client";

import { create } from "zustand";

/**
 * Live Freighter wallet connectivity, as seen by the connection monitor
 * (src/hooks/useWalletConnectionMonitor.ts).
 *
 * This is deliberately separate from the auth session: a user can hold a
 * valid JWT while their wallet extension is locked or disconnected, and
 * wallet-dependent actions (signing settlements, treasury transfers) must
 * be paused until it is reconnected.
 */
interface WalletConnectionState {
  /**
   * `null` = not yet determined (initial state, or signed out),
   * `true` = Freighter reports connected, `false` = disconnected/locked.
   */
  isConnected: boolean | null;
  setConnected: (connected: boolean | null) => void;
}

export const useWalletStore = create<WalletConnectionState>()((set) => ({
  isConnected: null,
  setConnected: (isConnected) => set({ isConnected }),
}));

/**
 * Convenience selector: true only when the wallet is known to be
 * disconnected. Unknown (monitor hasn't reported yet) is treated as
 * connected so the UI never locks on first paint.
 */
export function useWalletDisconnected(): boolean {
  return useWalletStore((s) => s.isConnected === false);
}
