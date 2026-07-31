"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth as useAuthStore, getPersistedSession } from "@/lib/auth-store";
import { loginWithWallet, readWalletSnapshot, WalletError } from "@/lib/stellar";
import { resetSessionExpired } from "@/lib/api";
import { decideSessionRestore } from "@/lib/walletSession";

/**
 * Re-establish the session for a persisted wallet identity, once per load.
 *
 * The token is never stored, so "restoring" means re-running the existing
 * SEP-10 flow — not reading a credential back out of the browser. It is
 * only attempted when the extension already reports the same account
 * without being prompted, which is exactly the case the user experiences
 * as "I was still connected".
 *
 * Everything browser-only lives inside this effect, so server rendering
 * is unaffected: the store starts in `pending` and the UI shows its
 * restoring state until this settles.
 */
export function useSessionRestore() {
  const queryClient = useQueryClient();
  const hydrated = useAuthStore((s) => s.hydrated);
  const restoreStatus = useAuthStore((s) => s.restoreStatus);
  // A ref, not state: this must latch synchronously so a re-render
  // during the async restore cannot start a second wallet round-trip.
  const started = useRef(false);

  useEffect(() => {
    if (!hydrated || started.current) return;
    started.current = true;

    const store = useAuthStore.getState();
    const persisted = getPersistedSession();
    const tokenPublicKey = store.token ? store.user?.stellarPublicKey ?? null : null;

    if (!persisted) {
      store.setRestoreStatus("settled");
      return;
    }

    let cancelled = false;
    store.setRestoreStatus("restoring");

    void (async () => {
      const wallet = await readWalletSnapshot().catch(() => ({
        status: "unavailable" as const,
        publicKey: null,
      }));
      if (cancelled) return;
      // Reflect the wallet's own account straight away, so the UI can
      // show which key is active even before a session exists for it.
      useAuthStore.getState().setActiveWalletPublicKey(wallet.publicKey);

      const action = decideSessionRestore({
        persisted,
        wallet,
        tokenPublicKey,
      });

      switch (action) {
        case "restore":
          useAuthStore.getState().setRestoreStatus("settled");
          return;

        case "account_changed":
          // Everything cached belongs to the previous public key.
          queryClient.clear();
          useAuthStore.getState().forgetWallet();
          toast.info("Your wallet account changed. Connect again to continue.");
          return;

        case "expired":
        case "await_wallet":
        case "none":
          // Recoverable: the login screen still offers a connect action.
          queryClient.clear();
          useAuthStore.getState().forgetWallet();
          return;

        case "reauthenticate":
          try {
            const user = await loginWithWallet();
            if (cancelled) return;
            resetSessionExpired();
            if (user.stellarPublicKey !== persisted.publicKey) {
              // The wallet switched accounts mid-restore.
              queryClient.clear();
            } else {
              await queryClient.invalidateQueries();
            }
            useAuthStore.getState().setRestoreStatus("settled");
          } catch (err) {
            if (cancelled) return;
            queryClient.clear();
            useAuthStore.getState().forgetWallet();
            if (err instanceof WalletError && err.code !== "user_rejected") {
              toast.error(err.message);
            }
          }
          return;

        default:
          useAuthStore.getState().setRestoreStatus("settled");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, queryClient]);

  return { restoring: !hydrated || restoreStatus !== "settled" };
}
