"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** Default inactivity window before the session is ended. */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/** How long before the timeout the warning is shown. */
export const WARNING_TIMEOUT_MS = 1 * 60 * 1000; // 1 minute

export interface UseIdleSessionResult {
  /** True once the inactivity window has fully elapsed. */
  isIdle: boolean;
  /** True while the "your session is about to expire" warning is showing. */
  showWarning: boolean;
  /** Seconds the warning gives the user to react (for the countdown copy). */
  warningSeconds: number;
  /** Restart both timers — call when the user chooses to stay signed in. */
  resetTimers: () => void;
}

/**
 * Idle-session watchdog (#898).
 *
 * Two timers are kept: one fires the warning shortly before the timeout, and
 * one ends the session. Activity resets both, so an active user is never
 * logged out.
 *
 * The timeout callback is read through a ref. Callers (the app layout in
 * particular) pass an inline closure, and keeping it out of the effect
 * dependencies means an unrelated render cannot tear down and rebuild the
 * timers — the bug that made the warning state reset itself.
 */
export function useIdleSession(
  onTimeout: () => void,
  timeoutMs: number = IDLE_TIMEOUT_MS
): UseIdleSessionResult {
  const warningLeadMs = Math.min(WARNING_TIMEOUT_MS, timeoutMs);
  const [isIdle, setIsIdle] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Once the warning is visible, only an explicit "stay signed in" may clear
  // it. Mouse movement alone must not dismiss a security warning (#898), so
  // the activity listener reads this ref and ignores events while it is true.
  const warningVisibleRef = useRef(false);

  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
  }, []);

  const resetTimers = useCallback(() => {
    warningVisibleRef.current = false;
    setIsIdle(false);
    setShowWarning(false);
    clearTimers();

    warningTimerRef.current = setTimeout(() => {
      warningVisibleRef.current = true;
      setShowWarning(true);
      // A toast guarantees the warning is noticed even if the dialog is
      // obscured or the tab is in the background. `id` keeps a burst of
      // activity events from stacking identical warnings.
      toast.warning("Your session is about to expire", {
        id: "idle-session-warning",
        description:
          "Stay signed in to keep your work, or sign out now. You will be logged out automatically.",
      });
    }, Math.max(0, timeoutMs - warningLeadMs));

    timerRef.current = setTimeout(() => {
      setIsIdle(true);
      // Read through the ref so a new inline callback does not require
      // restarting the timers.
      onTimeoutRef.current();
    }, timeoutMs);
  }, [clearTimers, timeoutMs, warningLeadMs]);

  useEffect(() => {
    const events = ["mousemove", "keypress", "click", "scroll", "touchstart"];
    const handleActivity = () => {
      // While the persistent warning is on screen, ignore ambient activity.
      // The user has to choose Continue or Log Out explicitly.
      if (warningVisibleRef.current) return;
      resetTimers();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    resetTimers();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      clearTimers();
    };
  }, [clearTimers, resetTimers]);

  return {
    isIdle,
    showWarning,
    warningSeconds: Math.ceil(warningLeadMs / 1000),
    resetTimers,
  };
}
