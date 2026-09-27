"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { AuthGuard } from "../../components/auth-guard";
import { WalletErrorBoundary } from "../../components/wallet/WalletErrorBoundary";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { MutationSyncIndicator } from "../../components/ui/MutationSyncIndicator";
import { SessionTimeoutDialog } from "../../components/SessionTimeoutDialog";
import { useSessionRestore } from "../../hooks/useSessionRestore";
import { useIdleSession } from "../../hooks/useIdleSession";
import { useAuth } from "../../lib/auth-store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { restoreSession } = useSessionRestore();
  const { forgetWallet } = useAuth();
  const [showTimeoutDialog, setShowTimeoutDialog] = useState(false);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const handleSessionTimeout = () => {
    forgetWallet();
    window.location.href = "/";
  };

  const { showWarning, resetTimers } = useIdleSession(handleSessionTimeout);

  const handleContinueSession = () => {
    resetTimers();
    setShowTimeoutDialog(false);
  };

  const handleLogout = () => {
    forgetWallet();
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
      />
    </WalletErrorBoundary>
  );
}
