"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { LogoMark } from "./logo";
import { isSessionExpired } from "@/lib/api";
import { SessionExpiryDialog } from "./session-expiry-dialog";

/**
 * Client-side guard: waits for the persisted wallet session to be
 * restored, then redirects to /login when there is still no session.
 *
 * The redirect must not fire while a restore is in flight — bouncing a
 * still-connected wallet to the login screen is exactly the confusing
 * state this guard exists to avoid.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, hydrated, restoring } = useAuth();
  const router = useRouter();
  const expired = isSessionExpired();

  useEffect(() => {
    if (hydrated && !restoring && !token) router.replace("/login");
  }, [hydrated, restoring, token, router]);

  if (!hydrated || restoring || !token) {
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
  return (
    <>
      {children}
      {expired && <SessionExpiryDialog />}
    </>
  );
}
