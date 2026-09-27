"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const WARNING_TIMEOUT_MS = 1 * 60 * 1000; // 1 minute before timeout

export function useIdleSession(
  onTimeout: () => void,
  timeoutMs: number = IDLE_TIMEOUT_MS
) {
  const [isIdle, setIsIdle] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef(Date.now());

  const resetTimers = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsIdle(false);
    setShowWarning(false);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
    }

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
    }, timeoutMs - WARNING_TIMEOUT_MS);

    timerRef.current = setTimeout(() => {
      setIsIdle(true);
      onTimeout();
    }, timeoutMs);
  }, [onTimeout, timeoutMs]);

  const handleActivity = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    const events = ["mousemove", "keypress", "click", "scroll", "touchstart"];

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    resetTimers();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current);
      }
    };
  }, [handleActivity, resetTimers]);

  return { isIdle, showWarning, resetTimers };
}
