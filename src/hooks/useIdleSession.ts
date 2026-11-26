"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_IDLE_WARNING_MS,
  IDLE_ACTIVITY_EVENTS,
  IDLE_CHECK_INTERVAL_MS,
  evaluateIdleState,
  resolveIdleTimeoutConfig,
  type IdleState,
} from "@/lib/idleTimeout";

export interface UseIdleSessionResult {
  /** True once the idle threshold has been reached. */
  isIdle: boolean;
  /** True while the warning window is open (and after expiry). */
  showWarning: boolean;
  /** Milliseconds until the session locks. */
  timeLeftMs: number;
  /** Milliseconds since the last observed interaction. */
  idleMs: number;
  /** Treat the current moment as activity and restart the countdown. */
  resetTimers: () => void;
}

/**
 * Track user inactivity for the signed-in app shell (#910).
 *
 * Two things are deliberately different from a plain debounce:
 *
 * 1. Activity is recorded in a ref and a single interval evaluates the
 *    deadline. Background tabs throttle timers, so when the tab regains
 *    focus/visibility the elapsed time is re-evaluated rather than assumed to
 *    be under the threshold. Focus alone never *resets* the timer — merely
 *    looking at the tab is not interaction.
 * 2. `onTimeout` is read through a ref and fires at most once per idle period.
 *    Passing a fresh inline callback on every render therefore cannot
 *    reschedule the countdown, and a re-render can never fire a second lock.
 *
 * All listeners and the interval are removed on unmount.
 */
export function useIdleSession(
  onTimeout: () => void,
  timeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS,
  warningMs: number = DEFAULT_IDLE_WARNING_MS,
  enabled: boolean = true
): UseIdleSessionResult {
  const config = resolveIdleTimeoutConfig({ timeoutMs, warningMs });

  const [state, setState] = useState<IdleState>(() =>
    evaluateIdleState({
      lastActivityAt: Date.now(),
      timeoutMs: config.timeoutMs,
      warningMs: config.warningMs,
    })
  );

  const lastActivityRef = useRef(Date.now());
  const timeoutFiredRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const resetTimers = useCallback(() => {
    lastActivityRef.current = Date.now();
    timeoutFiredRef.current = false;
    setState(
      evaluateIdleState({
        lastActivityAt: lastActivityRef.current,
        timeoutMs: config.timeoutMs,
        warningMs: config.warningMs,
      })
    );
  }, [config.timeoutMs, config.warningMs]);

  const resolvedTimeout = config.timeoutMs;
  const resolvedWarning = config.warningMs;

  useEffect(() => {
    if (!enabled) {
      // Signed-out or locked sessions have nothing to protect; showing a
      // warning over a login redirect would just be noise.
      setState(
        evaluateIdleState({
          lastActivityAt: Date.now(),
          timeoutMs: resolvedTimeout,
          warningMs: resolvedWarning,
        })
      );
      return;
    }

    const evaluate = () => {
      const next = evaluateIdleState({
        lastActivityAt: lastActivityRef.current,
        timeoutMs: resolvedTimeout,
        warningMs: resolvedWarning,
      });
      setState(next);

      if (next.phase === "expired" && !timeoutFiredRef.current) {
        timeoutFiredRef.current = true;
        onTimeoutRef.current();
      }
    };

    const onActivity = () => {
      // Once locked, only an explicit `resetTimers` may revive the session.
      if (timeoutFiredRef.current) return;
      lastActivityRef.current = Date.now();
      evaluate();
    };

    // Re-evaluate the real elapsed time when the tab becomes active again.
    // The interval may have been throttled while hidden, so without this a
    // user could return to a tab whose session should already be locked.
    const onFocus = () => evaluate();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") evaluate();
    };

    for (const eventName of IDLE_ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    resetTimers();
    const interval = window.setInterval(evaluate, IDLE_CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      for (const eventName of IDLE_ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, resolvedTimeout, resolvedWarning, resetTimers]);

  return {
    isIdle: state.phase === "expired",
    showWarning: state.phase !== "active",
    timeLeftMs: state.remainingMs,
    idleMs: state.idleMs,
    resetTimers,
  };
}
