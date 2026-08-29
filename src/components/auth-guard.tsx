"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { LogoMark } from "./logo";
import { isSessionExpired } from "@/lib/api";
import { SessionExpiryDialog } from "./session-expiry-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth as useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";

const IDLE_TIMEOUT_MS = 13 * 60 * 1000;
const WARNING_DURATION_MS = 2 * 60 * 1000;

export function IdleSessionWarningModal() {
  const router = useRouter();
  const { token, logout } = useAuth();
  const [warningOpen, setWarningOpen] = useState(false);
  const [timeLeftMs, setTimeLeftMs] = useState(WARNING_DURATION_MS);
  const lastInteractionRef = useRef(Date.now());
  const warningStartedAtRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef(false);

  const resetActivity = useCallback(() => {
    lastInteractionRef.current = Date.now();
    warningStartedAtRef.current = null;
    setWarningOpen(false);
    setTimeLeftMs(WARNING_DURATION_MS);
  }, []);

  const handleLogout = useCallback(async () => {
    setWarningOpen(false);
    await logout();
    router.replace("/");
  }, [logout, router]);

  const handleStayLoggedIn = useCallback(async () => {
    if (!token || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const refreshed = await api.authRefresh();
      const sessionUser = refreshed.user ?? useAuthStore.getState().user;
      if (refreshed.token && sessionUser) {
        useAuthStore.getState().setSession(refreshed.token, sessionUser);
      }
      resetActivity();
    } catch {
      await handleLogout();
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [handleLogout, resetActivity, token]);

  useEffect(() => {
    if (!token) {
      setWarningOpen(false);
      return;
    }

    const onActivity = () => {
      if (!warningOpen) {
        lastInteractionRef.current = Date.now();
      } else {
        resetActivity();
      }
    };

    const activityEvents = [
      "keydown",
      "mousedown",
      "mousemove",
      "scroll",
      "click",
      "touchstart",
      "pointerdown",
    ] as const;

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }

    const tick = window.setInterval(() => {
      const idleMs = Date.now() - lastInteractionRef.current;

      if (idleMs >= IDLE_TIMEOUT_MS) {
        if (!warningOpen) {
          warningStartedAtRef.current = Date.now();
          setWarningOpen(true);
          setTimeLeftMs(WARNING_DURATION_MS);
          return;
        }

        const remaining = Math.max(
          0,
          WARNING_DURATION_MS - (Date.now() - (warningStartedAtRef.current ?? Date.now()))
        );
        setTimeLeftMs(remaining);

        if (remaining <= 0) {
          void handleLogout();
        }
        return;
      }

      if (warningOpen) {
        setWarningOpen(false);
        setTimeLeftMs(WARNING_DURATION_MS);
      }
    }, 250);

    return () => {
      window.clearInterval(tick);
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, onActivity);
      }
    };
  }, [handleLogout, resetActivity, token, warningOpen]);

  if (!token) return null;

  return (
    <Dialog
      open={warningOpen}
      onClose={() => {}}
      title="Session timeout warning"
      description="Your session is about to expire. Stay logged in or sign out to keep your work protected."
      dismissible={false}
      className="max-w-md"
    >
      <div className="flex flex-col items-center gap-5 py-2 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-3 border-ink bg-flamingo p-3 shadow-brutal-sm">
          <ShieldAlert className="h-8 w-8 text-ink" />
        </div>

        <div className="space-y-2">
          <p className="font-display text-xl uppercase tracking-wide text-ink">
            You’ve been idle for 13 minutes
          </p>
          <p className="text-sm text-ink/70">
            For your security, your Mergepay session will end in:
          </p>
          <p className="font-display text-4xl tracking-tight text-ink">
            {Math.max(0, Math.ceil(timeLeftMs / 1000))}s
          </p>
        </div>

        <Button
          className="w-full"
          onClick={() => {
            void handleStayLoggedIn();
          }}
          size="lg"
        >
          Stay Logged In
        </Button>
      </div>
    </Dialog>
  );
}

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
      <IdleSessionWarningModal />
    </>
  );
}
