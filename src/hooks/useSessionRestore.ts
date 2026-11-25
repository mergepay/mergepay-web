"use client";

import { useCallback, useEffect } from "react";
import { useAuth, getPersistedSession, getToken } from "../lib/auth-store";
import { useWalletStore } from "../lib/wallet-store";
import {
  decideSessionRestore,
  type SessionRestoreAction,
} from "../lib/walletSession";
import { probeWallet } from "../lib/stellar";
import { toast } from "sonner";

/** Public key the in-memory bearer token belongs to, or `null` when there is none. */
function tokenPublicKey(): string | null {
  if (!getToken()) return null;
  return useAuth.getState().user?.stellarPublicKey ?? null;
}

/**
 * Land the restore decision on store state.
 *
 * Every branch settles `restoreStatus`, because "checking" keeps the auth
 * guard on "Restoring your session…" and blocks the redirect to /login — a
 * branch that returns without settling strands the user on a spinner with no
 * wallet popup and no way to sign in.
 *
 * No branch runs a SEP-10 challenge. Re-establishing the session stays an
 * explicit click on /login: the persisted identity makes that one click
 * (the screen already names the account), and firing the challenge from load
 * would pop the wallet unasked and re-fire on every failure.
 */
function applyRestoreAction(action: SessionRestoreAction): void {
  const { setRestoreStatus, forgetWallet } = useAuth.getState();
  const wallet = useWalletStore.getState();

  switch (action) {
    case "none":
      // Nothing was persisted (or the payload was unusable): logged out.
      setRestoreStatus("settled");
      return;

    case "restore":
      // A live token already covers the persisted identity.
      wallet.setConnected(true);
      setRestoreStatus("settled");
      return;

    case "reauthenticate":
      // Same wallet, expired token: show the identity and let the app's
      // authorised requests send the user back to /login for one click.
      wallet.setConnected(true);
      setRestoreStatus("settled");
      return;

    case "expired":
      toast.info("Session expired. Please sign in again.");
      forgetWallet();
      wallet.setConnected(false);
      return;

    case "account_changed":
      toast.error("Freighter account switched. Please sign in again.");
      forgetWallet();
      wallet.setConnected(false);
      return;

    case "wait":
    case "await_wallet":
      // Freighter cannot confirm the account right now — absent, locked, or no
      // account shared. The persisted identity stays: it is public data, and
      // dropping it would lose the address the login screen shows the moment a
      // user dismisses a Freighter popup. `probeWallet` always resolves, so
      // "wait" is only reachable for a caller that passes a pending snapshot.
      toast.error("Freighter wallet is disconnected or locked.");
      wallet.setConnected(false);
      setRestoreStatus("settled");
      return;
  }
}

let restorePromise: Promise<void> | null = null;

async function runRestore(): Promise<void> {
  useAuth.getState().setRestoreStatus("checking");
  try {
    const persisted = getPersistedSession();
    // Without a persisted identity there is nothing to ask the wallet about.
    const wallet = persisted
      ? await probeWallet()
      : { status: "resolved" as const, publicKey: null };

    applyRestoreAction(
      decideSessionRestore({
        persisted,
        wallet,
        tokenPublicKey: tokenPublicKey(),
      })
    );
  } catch (err) {
    console.error("Session restore failed:", err);
    useAuth.getState().setRestoreStatus("settled");
  } finally {
    restorePromise = null;
  }
}

/**
 * Automatically checks session persistence and verifies Freighter connection status on app load.
 * Resets store state and notifies via `sonner` toast if the wallet disconnected or account switched.
 */
export function useSessionRestore() {
  const restoreStatus = useAuth((s) => s.restoreStatus);

  useEffect(() => {
    // Both reads are needed. `restoreStatus` is what re-arms this effect when
    // a caller resets it to "idle"; the live read is what stops the surfaces
    // that mount this hook from each firing their own probe — and their own toast —
    // off the same render-time "idle".
    if (restoreStatus !== "idle") return;
    if (useAuth.getState().restoreStatus !== "idle") return;

    if (!restorePromise) {
      restorePromise = runRestore();
    }
  }, [restoreStatus]);

  // Stable across renders: the app layout calls this from an effect, and a
  // fresh closure every render would re-arm that effect on every render —
  // resetting a settled restore back to "idle" forever.
  const restoreSession = useCallback(
    () => useAuth.getState().setRestoreStatus("idle"),
    []
  );

  return { restoreSession };
}
