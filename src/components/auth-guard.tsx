"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { LogoMark } from "./logo";
import { isSessionExpired } from "@/lib/api";
import { SessionExpiryDialog } from "./session-expiry-dialog";
import { useTokenExpiry } from "@/hooks/useTokenExpiry";

/**
 * Client-side guard: waits for the persisted wallet session to be
 * restored, then redirects to /login when there is still no session.
 *
 * The redirect must not fire while a restore is in flight — bouncing a
 * still-connected wallet to the login screen is exactly the confusing
 * state this guard exists to avoid.
 *
 * Idle-timeout handling lives in the app layout (`useIdleSession` +
 * `SessionTimeoutDialog`). This guard used to mount a second, competing idle
 * timer at 13 minutes, so a user could be shown two different expiry dialogs
 * at once. The guard now owns only the two expiry paths that belong to auth
 * itself: the proactive JWT `exp` watcher and the reactive 401 dialog.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, restoring, logout } = useAuth();
  const router = useRouter();
  const expired = isSessionExpired();

  // Proactive, `exp`-claim-driven session timeout (#393): sign out right as
  // the token expires even if no network call surfaces a 401. Defined with
  // `logout` as a stable reference so the expiry timer never self-reschedules
  // on unrelated re-renders.
  useTokenExpiry({
    onExpire: () => {
      void logout().then(() => router.replace("/login"));
    },
  });

  useEffect(() => {
    if (!restoring && !token) router.replace("/login");
  }, [restoring, token, router]);

  if (restoring || !token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper">
        <div className="animate-wiggle">
          <LogoMark size={56} />
        </div>
        <p
          className="font-display text-xs uppercase tracking-widest text-ink/50"
          role="status"
          aria-live="polite"
        >
          {restoring ? "Restoring your session…" : "Loading…"}
        </p>
      </div>
    );
  }

  // If the session is expired, we still render the children (so forms aren't lost),
  // but we overlay the expiry dialog to force re-auth.
  //
  // Inactivity locking lives in the route-group layout (#910), which owns the
  // single idle timer and swaps this guard out for its own re-auth screen.
  return (
    <>
      {children}
      {expired && <SessionExpiryDialog />}
    </>
  );
}
