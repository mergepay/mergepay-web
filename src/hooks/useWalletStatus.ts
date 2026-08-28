"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WatchWalletChanges } from "@stellar/freighter-api";
import { NETWORK_PASSPHRASE, STELLAR_NETWORK } from "@/lib/constants";
import {
  getGrantedAddress,
  getWalletNetwork,
  isFreighterAvailable,
} from "@/lib/stellar";
import {
  deriveWalletStatus,
  type WalletProbe,
  type WalletStatus,
} from "@/lib/walletStatus";

/** How often the Freighter watcher re-reads the account and network. */
const WATCH_INTERVAL_MS = 2_000;

const INITIAL_PROBE: WalletProbe = {
  available: null,
  address: null,
  networkPassphrase: null,
  networkName: null,
};

/**
 * Live wallet + network status for the authenticated shell.
 *
 * Only public data is held in state — the granted address and the selected
 * network — and none of it is written to storage. The hook never prompts:
 * connecting is an explicit user action via `connect`.
 *
 * Failures are absorbed into the status itself, so a missing or unresponsive
 * wallet can never stop a read-only page from rendering.
 */
export function useWalletStatus(): WalletStatus & { refresh: () => void } {
  const [probe, setProbe] = useState<WalletProbe>(INITIAL_PROBE);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const available = await isFreighterAvailable();
    if (!mountedRef.current) return;

    if (!available) {
      setProbe({
        available: false,
        address: null,
        networkPassphrase: null,
        networkName: null,
      });
      return;
    }

    const [address, network] = await Promise.all([
      getGrantedAddress(),
      getWalletNetwork(),
    ]);
    if (!mountedRef.current) return;

    setProbe({
      available: true,
      address,
      networkPassphrase: network?.networkPassphrase ?? null,
      networkName: network?.network || null,
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    // The Freighter watcher reports account and network changes, covering the
    // connect, disconnect, account-switch, and network-switch transitions.
    let watcher: WatchWalletChanges | null = null;
    try {
      watcher = new WatchWalletChanges(WATCH_INTERVAL_MS);
      watcher.watch((params) => {
        if (!mountedRef.current) return;
        if (params.error) {
          void refresh();
          return;
        }
        setProbe({
          available: true,
          address: params.address || null,
          networkPassphrase: params.networkPassphrase || null,
          networkName: params.network || null,
        });
      });
    } catch {
      // No watcher available — the one-shot probe above still applies.
    }

    return () => {
      mountedRef.current = false;
      try {
        watcher?.stop();
      } catch {
        // Best effort; the watcher is gone with the component either way.
      }
    };
  }, [refresh]);

  const status = deriveWalletStatus(probe, {
    networkPassphrase: NETWORK_PASSPHRASE,
    network: STELLAR_NETWORK,
  });

  return { ...status, refresh: () => void refresh() };
}
