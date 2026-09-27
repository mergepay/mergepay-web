"use client";

import { useEffect } from "react";
import { AppShell } from "../../components/app-shell";
import { AuthGuard } from "../../components/auth-guard";
import { WalletErrorBoundary } from "../../components/wallet/WalletErrorBoundary";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { useSessionRestore } from "../../hooks/useSessionRestore";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { restoreSession } = useSessionRestore();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

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
        </AuthGuard>
      </ErrorBoundary>
    </WalletErrorBoundary>
  );
}
