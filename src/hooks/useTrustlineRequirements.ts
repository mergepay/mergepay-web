"use client";

/**
 * Aggregate settlement-asset trustline check (#370 / #378).
 *
 * `useTrustlineCheck` answers "does this wallet hold *this* asset?" and is
 * used for per-asset prompts. The verification banner needs the whole
 * picture — every configured settlement asset at once — so it can warn
 * before a settle is started, so this hook reads the connected account's
 * balances from Horizon once and derives the missing set.
 *
 * The probe never prompts, so mounting this on a page cannot surface a
 * Freighter popup. `WatchWalletChanges` re-runs the check when the
 * account or network changes, so connecting, disconnecting or switching
 * accounts updates the result without a reload. Every failure is absorbed
 * into the returned state — a Horizon outage must never crash a page.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { WatchWalletChanges } from "@stellar/freighter-api";
import {
  getGrantedAddress,
  getWalletAssets,
  isFreighterAvailable,
} from "@/lib/stellar";
import { summarizeTrustlines } from "@/lib/trustlineCheck";
import type { TrustlineAsset } from "@/lib/trustline";

/** How often Freighter reports account/network changes while mounted. */
const WATCH_INTERVAL_MS = 15_000;

export type TrustlineRequirementStatus =
  /** Still reading the wallet — the answer is not known yet. */
  | "checking"
  /** Aligned with the wallet: no missing trustlines. */
  | "ready"
  /** Wallet is connected but at least one settlement asset is missing. */
  | "missing"
  /** Freighter is absent or no account is shared — nothing to check. */
  | "disconnected"
  /** The wallet or Horizon could not be read. */
  | "error";

export interface TrustlineRequirementState {
  status: TrustlineRequirementStatus;
  /** Active public key the check ran against, or `null`. */
  address: string | null;
  /** Every configured settlement asset and its trustline status. */
  assets: TrustlineAsset[];
  /** Subset of `assets` the wallet cannot receive yet. */
  missing: TrustlineAsset[];
  /** User-facing message when `status` is `"error"`. */
  error: string | null;
}

export interface UseTrustlineRequirements extends TrustlineRequirementState {
  /** Re-read the wallet immediately (used after adding a trustline). */
  refresh: () => void;
}

const INITIAL_STATE: TrustlineRequirementState = {
  status: "checking",
  address: null,
  assets: [],
  missing: [],
  error: null,
};

export function useTrustlineRequirements(): UseTrustlineRequirements {
  const [state, setState] =
    useState<TrustlineRequirementState>(INITIAL_STATE);
  const mounted = useRef(true);

  const runCheck = useCallback(async () => {
    try {
      const available = await isFreighterAvailable();
      if (!mounted.current) return;

      if (!available) {
        setState({
          status: "disconnected",
          address: null,
          assets: [],
          missing: [],
          error: null,
        });
        return;
      }

      const address = await getGrantedAddress();
      if (!mounted.current) return;

      if (!address) {
        setState({
          status: "disconnected",
          address: null,
          assets: [],
          missing: [],
          error: null,
        });
        return;
      }

      setState((previous) => ({ ...previous, status: "checking", address }));

      const assets = await getWalletAssets(address);
      if (!mounted.current) return;

      const { status, missing } = summarizeTrustlines(assets);
      setState({ status, address, assets, missing, error: null });
    } catch {
      if (!mounted.current) return;
      setState((previous) => ({
        ...previous,
        status: "error",
        error:
          "We couldn't check your wallet's trustlines. Check your connection and try again.",
      }));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void runCheck();

    let watcher: WatchWalletChanges | null = null;
    try {
      watcher = new WatchWalletChanges(WATCH_INTERVAL_MS);
      watcher.watch(() => {
        if (!mounted.current) return;
        // Any account or network change invalidates the previous answer.
        void runCheck();
      });
    } catch {
      // No watcher available — the one-shot check above still applies.
    }

    return () => {
      mounted.current = false;
      try {
        watcher?.stop();
      } catch {
        // Best effort; the watcher is gone with the component either way.
      }
    };
  }, [runCheck]);

  return {
    ...state,
    refresh: () => {
      setState((previous) => ({ ...previous, status: "checking" }));
      void runCheck();
    },
  };
}
