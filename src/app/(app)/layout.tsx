"use client";

import { useEffect } from "react";
import { AppShell } from "../../components/app-shell";
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
        <AppShell>
          <ErrorBoundary>{children}</ErrorBoundary>
        </AppShell>
      </ErrorBoundary>
    </WalletErrorBoundary>
  );
}
