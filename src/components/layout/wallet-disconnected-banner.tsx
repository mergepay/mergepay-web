"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useWalletConnectionMonitor } from "@/hooks/useWalletConnectionMonitor";
import { useWalletStore } from "@/lib/wallet-store";

/**
 * Persistent, non-intrusive banner shown at the top of the app when the
 * Freighter wallet disconnects mid-session (locked wallet, suspended tab,
 * extension reload). Offers a one-click reconnect that re-runs the SEP-10
 * login flow; on success the banner disappears and data refreshes.
 *
 * Also hosts the single {@link useWalletConnectionMonitor} instance — it is
 * rendered exactly once, inside AppShell, so the poll runs for the whole
 * authenticated session.
 */
export function WalletDisconnectedBanner() {
  const { token, login } = useAuth();
  const queryClient = useQueryClient();
  const [reconnecting, setReconnecting] = useState(false);

  useWalletConnectionMonitor(Boolean(token));

  const isConnected = useWalletStore((s) => s.isConnected);

  if (!token || isConnected !== false) return null;

  async function reconnect() {
    setReconnecting(true);
    try {
      // The full SEP-10 login sequence (challenge → sign → verify), the
      // same flow used for the initial sign-in.
      await login();
      useWalletStore.getState().setConnected(true);
      // login() invalidates every query; this makes the refresh explicit
      // so banner dismissal and fresh data always arrive together.
      await queryClient.invalidateQueries();
      toast.success("Wallet reconnected");
    } catch {
      // login() already surfaces the reason (wallet rejected, not
      // installed, network) via its own error toast — stay silent here
      // so the failure is never shown twice.
    } finally {
      setReconnecting(false);
    }
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 border-b-3 border-ink bg-butter px-4 py-2.5 md:px-8"
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <Wallet className="h-4 w-4 shrink-0" />
        Wallet disconnected. Please reconnect.
      </p>
      <Button size="sm" onClick={reconnect} loading={reconnecting}>
        Reconnect
      </Button>
    </div>
  );
}
