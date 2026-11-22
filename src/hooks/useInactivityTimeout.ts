"client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface UseInactivityTimeoutOptions {
  timeoutMs?: number;
  warningMs?: number;
  enabled?: boolean;
  onTimeout?: () => void;
  onExtend?: () => void;
}

export function useInactivityTimeout({
  timeoutMs = 15 * 60 * 1000, // 15 minutes default
  warningMs = 2 * 60 * 1000,  // 2 minutes warning window default
  enabled = true,
  onTimeout,
  onExtend,
}: UseInactivityTimeoutOptions = {}) {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(Math.floor(warningMs / 1000));

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const clearAllTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    timeoutRef.current = null;
    warningRef.current = null;
    countdownRef.current = null;
  }, []);

  const handleTimeout = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);
    if (onTimeout) {
      onTimeout();
    }
  }, [clearAllTimers, onTimeout]);

  const startTimers = useCallback(() => {
    if (!enabled) return;
    clearAllTimers();

    const activeTimeout = timeoutMs - warningMs;

    warningRef.current = setTimeout(() => {
      setShowWarning(true);
      setRemainingSeconds(Math.floor(warningMs / 1000));

      countdownRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, activeTimeout > 0 ? activeTimeout : 0);

    timeoutRef.current = setTimeout(() => {
      handleTimeout();
    }, timeoutMs);
  }, [enabled, timeoutMs, warningMs, clearAllTimers, handleTimeout]);

  const resetTimer = useCallback(() => {
    if (!enabled) return;
    if (showWarning) return; // Do not auto-reset on activity while warning is displayed unless explicitly extended
    startTimers();
  }, [enabled, showWarning, startTimers]);

  const extendSession = useCallback(() => {
    setShowWarning(false);
    clearAllTimers();
    startTimers();
    if (onExtend) {
      onExtend();
    }
  }, [clearAllTimers, startTimers, onExtend]);

  useEffect(() => {
    if (!enabled) {
      clearAllTimers();
      setShowWarning(false);
      return;
    }

    startTimers();

    const events = ["mousedown", "keydown", "touchstart", "mousemove", "scroll"];
    const handleActivity = () => {
      resetTimer();
    };

    for (const event of events) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      clearAllTimers();
      for (const event of events) {
        window.removeEventListener(event, handleActivity);
      }
    };
  }, [enabled, startTimers, clearAllTimers, resetTimer]);

  return {
    showWarning,
    remainingSeconds,
    extendSession,
    forceTimeout: handleTimeout,
  };
}
