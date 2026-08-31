"use client";

import { useEffect } from "react";
import { AppShell } from "../../components/app-shell";
import { WalletErrorBoundary } from "../../components/wallet/WalletErrorBoundary";
import { useSessionRestore } from "../../hooks/useSessionRestore";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { restoreSession } = useSessionRestore();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return (
    <WalletErrorBoundary subject="wallet session">
      <AppShell>{children}</AppShell>
    </WalletErrorBoundary>
  );
}
