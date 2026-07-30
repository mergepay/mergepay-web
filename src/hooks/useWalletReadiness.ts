"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WatchWalletChanges } from "@stellar/freighter-api";
import { useAuth as useAuthStore } from "@/lib/auth-store";
import { probeWallet } from "@/lib/stellar";
import {
  evaluateWalletReadiness,
  type WalletProbe,
  type WalletReadiness,
} from "@/lib/walletReadiness";

/** How often the Freighter watcher re-reads account and network state. */
const WATCH_INTERVAL_MS = 2000;

const INITIAL_PROBE: WalletProbe = {
  status: "checking",
  publicKey: null,
  networkPassphrase: null,
  networkName: null,
};

export interface UseWalletReadiness extends WalletReadiness {
  /** Raw probe result, exposed for messaging that needs the wallet's own values. */
  probe: WalletProbe;
  /** Re-read the wallet immediately (used by "check again" controls). */
  refresh: () => void;
}

/**
 * Live readiness of the wallet for a signing action.
 *
 * The probe never prompts, so calling this on render cannot surface a
 * Freighter popup. It is refreshed by `WatchWalletChanges`, which reports
 * account *and* network changes, so connecting, disconnecting, switching
 * account or switching network all update the result without a reload.
 *
 * The decision itself lives in `lib/walletReadiness.ts` — this hook only
 * feeds it observations, so the button state and the submit handler can
 * share one answer.
 */
export function useWalletReadiness(): UseWalletReadiness {
  const sessionPublicKey = useAuthStore((s) => s.user?.stellarPublicKey ?? null);
  const [probe, setProbe] = useState<WalletProbe>(INITIAL_PROBE);
  const mounted = useRef(true);

  const runProbe = useCallback(async () => {
    try {
      const next = await probeWallet();
      if (mounted.current) setProbe(next);
    } catch {
      // A probe that throws is indistinguishable from no wallet at all.
      if (mounted.current) {
        setProbe({
          status: "unavailable",
          publicKey: null,
          networkPassphrase: null,
          networkName: null,
        });
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void runProbe();

    let watcher: WatchWalletChanges | null = null;
    try {
      watcher = new WatchWalletChanges(WATCH_INTERVAL_MS);
      watcher.watch((params) => {
        if (!mounted.current) return;
        if (params.error) {
          setProbe({
            status: "resolved",
            publicKey: null,
            networkPassphrase: null,
            networkName: null,
          });
          return;
        }
        setProbe({
          status: "resolved",
          publicKey: params.address || null,
          networkPassphrase: params.networkPassphrase || null,
          networkName: params.network || null,
        });
      });
    } catch {
      // No watcher available — the initial probe result stands, and the
      // UI still offers an explicit "check again" control.
    }

    return () => {
      mounted.current = false;
      try {
        watcher?.stop();
      } catch {
        // Best effort: a watcher that cannot be stopped is inert anyway.
      }
    };
  }, [runProbe]);

  const readiness = evaluateWalletReadiness({ ...probe, sessionPublicKey });

  return {
    ...readiness,
    probe,
    refresh: () => {
      setProbe((current) => ({ ...current, status: "checking" }));
      void runProbe();
    },
  };
}
