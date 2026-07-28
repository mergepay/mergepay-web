"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { LogoMark } from "./logo";
import { isSessionExpired } from "@/lib/api";
import { SessionExpiryDialog } from "./session-expiry-dialog";

/** Client-side guard: redirects to /login when there is no session. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, hydrated } = useAuth();
  const router = useRouter();
  const expired = isSessionExpired();

  useEffect(() => {
    // Only redirect if there is no token AND the session hasn't explicitly expired.
    // If the session expired, we keep the user on the page and show the dialog instead.
    if (hydrated && !token && !expired) {
      router.replace("/login");
    }
  }, [hydrated, token, expired, router]);

  // If we are hydrating, or we have no token and it's NOT an expired session
  if (!hydrated || (!token && !expired)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="animate-wiggle">
          <LogoMark size={56} />
        </div>
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
