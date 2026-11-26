"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
export const INACTIVITY_WARNING_MS = 60 * 1000;

export interface InactivityTimeoutState {
  isIdle: boolean;
  showWarning: boolean;
  warningSeconds: number;
  resetTimers: () => void;
}

/**
 * Client-only inactivity watchdog. A wall-clock deadline also covers
 * background tabs where browsers throttle setTimeout callbacks.
 *
 * Activity resets the countdown before the warning; once the warning is
 * visible, only the explicit Continue action can extend the session.
 */
export function useInactivityTimeout(
  onTimeout: () => void,
  timeoutMs = INACTIVITY_TIMEOUT_MS
): InactivityTimeoutState {
  const [isIdle, setIsIdle] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [warningSeconds, setWarningSeconds] = useState(0);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  const deadlineRef = useRef(0);
  const warningRef = useRef(false);
  const expiredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leadMs = Math.min(INACTIVITY_WARNING_MS, Math.max(0, timeoutMs));

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    if (warningTimerRef.current !== null) clearTimeout(warningTimerRef.current);
    timerRef.current = null;
    warningTimerRef.current = null;
  }, []);

  const expire = useCallback(() => {
    if (expiredRef.current) return;
    expiredRef.current = true;
    clearTimers();
    setIsIdle(true);
    setShowWarning(false);
    onTimeoutRef.current();
  }, [clearTimers]);

  const checkDeadline = useCallback(() => {
    if (expiredRef.current) return;
    const remaining = deadlineRef.current - Date.now();
    if (remaining <= 0) {
      expire();
    } else if (remaining <= leadMs && !warningRef.current) {
      warningRef.current = true;
      setWarningSeconds(Math.ceil(remaining / 1000));
      setShowWarning(true);
      toast.warning("Your session is about to expire", {
        id: "idle-session-warning",
        description: "Choose Continue Session to remain signed in.",
      });
    }
  }, [expire, leadMs]);

  const resetTimers = useCallback(() => {
    clearTimers();
    expiredRef.current = false;
    warningRef.current = false;
    setIsIdle(false);
    setShowWarning(false);
    setWarningSeconds(Math.ceil(leadMs / 1000));
    deadlineRef.current = Date.now() + Math.max(0, timeoutMs);
    warningTimerRef.current = setTimeout(checkDeadline, Math.max(0, timeoutMs - leadMs));
    timerRef.current = setTimeout(checkDeadline, Math.max(0, timeoutMs));
  }, [checkDeadline, clearTimers, leadMs, timeoutMs]);

  useEffect(() => {
    const onActivity = () => {
      // Check the absolute deadline before accepting activity after a
      // suspended/background tab has resumed.
      checkDeadline();
      if (!warningRef.current && !expiredRef.current) resetTimers();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") checkDeadline();
    };
    const events = ["mousemove", "keydown", "touchstart", "click", "scroll"] as const;
    for (const event of events) window.addEventListener(event, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    resetTimers();
    return () => {
      for (const event of events) window.removeEventListener(event, onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimers();
    };
  }, [checkDeadline, clearTimers, resetTimers]);

  return { isIdle, showWarning, warningSeconds, resetTimers };
}
