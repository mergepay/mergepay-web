"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "../../components/app-shell";
import { AuthGuard } from "../../components/auth-guard";
import { WalletErrorBoundary } from "../../components/wallet/WalletErrorBoundary";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { MutationSyncIndicator } from "../../components/ui/MutationSyncIndicator";
import { SessionTimeoutDialog } from "../../components/SessionTimeoutDialog";
import { useIdleSession } from "../../hooks/useIdleSession";
import { clearClientSession } from "../../lib/sessionMonitor";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [showTimeoutDialog, setShowTimeoutDialog] = useState(false);

  /**
   * Tear down everything scoped to the signed-in account. React Query holds
   * groups, balances and history, so clearing only the auth store would leave
   * the previous user's figures renderable after the next sign-in (#898).
   */
  const clearAccountCache = () => {
    queryClient.clear();
    // Auth, the selected group and the active asset are all account-scoped;
    // reset them together so the next sign-in starts clean (#898).
    clearClientSession();
  };

  const handleSessionTimeout = () => {
    clearAccountCache();
    toast.error("Your session expired due to inactivity.");
    window.location.href = "/";
  };

  const { showWarning, resetTimers, warningSeconds } =
    useIdleSession(handleSessionTimeout);

  const handleContinueSession = () => {
    resetTimers();
    setShowTimeoutDialog(false);
    toast.success("Session extended.");
  };

  const handleLogout = () => {
    clearAccountCache();
    window.location.href = "/";
  };

  useEffect(() => {
    if (showWarning) {
      setShowTimeoutDialog(true);
    }
  }, [showWarning]);

  return (
    <WalletErrorBoundary subject="wallet session">
      {/* Outer boundary guards the persistent shell (nav, sidebar, header).
          The nested one guards only the routed page so a crashing view degrades
          to the fallback without tearing down the navigation around it. */}
      <ErrorBoundary>
        {/* Everything in this route group is account data, so the guard waits
            for the wallet session to settle and sends a visitor without one to
            the sign-in screen instead of rendering a shell full of 401s. */}
        <AuthGuard>
          <AppShell>
            <ErrorBoundary>{children}</ErrorBoundary>
          </AppShell>
          {/* Non-blocking indicator shown while any mutation is in-flight,
              e.g. optimistic expense creation or deletion (#375). */}
          <MutationSyncIndicator />
        </AuthGuard>
      </ErrorBoundary>
      <SessionTimeoutDialog
        open={showTimeoutDialog}
        onContinue={handleContinueSession}
        onLogout={handleLogout}
        secondsRemaining={warningSeconds}
      />
    </WalletErrorBoundary>
  );
}
