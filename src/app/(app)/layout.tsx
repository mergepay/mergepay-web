"use client";

import { useCallback, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { AuthGuard } from "../../components/auth-guard";
import { WalletErrorBoundary } from "../../components/wallet/WalletErrorBoundary";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { MutationSyncIndicator } from "../../components/ui/MutationSyncIndicator";
import { SessionTimeoutDialog } from "../../components/SessionTimeoutDialog";
import { SessionExpiryDialog } from "../../components/session-expiry-dialog";
import { useIdleSession } from "../../hooks/useIdleSession";
import { useAuth } from "../../hooks/useAuth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { logout, token } = useAuth();
  const [locked, setLocked] = useState(false);

  /**
   * Idle lock (#910): clear the cached session *and* reveal a re-auth prompt.
   * The local state flips before `logout()` resolves so no account content can
   * stay on screen while the best-effort server revoke is in flight.
   */
  const handleSessionTimeout = useCallback(() => {
    setLocked(true);
    void logout();
  }, [logout]);

  const { showWarning, resetTimers, timeLeftMs } = useIdleSession(
    handleSessionTimeout,
    undefined,
    undefined,
    Boolean(token) && !locked
  );

  const handleContinueSession = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  const handleReauthenticated = useCallback(() => {
    // Start a fresh idle window; otherwise the expired deadline would
    // immediately reopen the warning dialog over the restored app.
    resetTimers();
    setLocked(false);
  }, [resetTimers]);

  const handleLogout = useCallback(() => {
    void logout();
    window.location.href = "/login";
  }, [logout]);

  return (
    <WalletErrorBoundary subject="wallet session">
      {/* Outer boundary guards the persistent shell (nav, sidebar, header).
          The nested one guards only the routed page so a crashing view degrades
          to the fallback without tearing down the navigation around it. */}
      <ErrorBoundary>
        {/* Everything in this route group is account data, so the guard waits
            for the wallet session to settle and sends a visitor without one to
            the sign-in screen instead of rendering a shell full of 401s. */}
        {locked ? (
          <SessionExpiryDialog
            reason="idle"
            onReauthenticated={handleReauthenticated}
          />
        ) : (
          <AuthGuard>
            <AppShell>
              <ErrorBoundary>{children}</ErrorBoundary>
            </AppShell>
            {/* Non-blocking indicator shown while any mutation is in-flight,
                e.g. optimistic expense creation or deletion (#375). */}
            <MutationSyncIndicator />
          </AuthGuard>
        )}
      </ErrorBoundary>
      {/* The warning is driven by the same timer that locks the session. Any
          real interaction resets the countdown and closes the dialog. */}
      <SessionTimeoutDialog
        open={showWarning && !locked}
        secondsRemaining={Math.ceil(timeLeftMs / 1000)}
        onContinue={handleContinueSession}
        onLogout={handleLogout}
      />
    </WalletErrorBoundary>
  );
}
