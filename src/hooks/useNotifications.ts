"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getStoredNotificationPreferences,
  setStoredNotificationPreferences,
  type NotificationPreferencesState,
} from "../lib/storage";

export function useNotifications() {
  const [preferences, setPreferences] = useState<NotificationPreferencesState>(getStoredNotificationPreferences);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const updatePreferences = useCallback((updater: Partial<NotificationPreferencesState> | ((prev: NotificationPreferencesState) => NotificationPreferencesState)) => {
    setPreferences((prev) => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      setStoredNotificationPreferences(next);
      return next;
    });
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "denied";
    }
    try {
      const res = await Notification.requestPermission();
      setPermission(res);
      if (res === "granted") {
        updatePreferences({ pushEnabled: true });
      } else {
        updatePreferences({ pushEnabled: false });
      }
      return res;
    } catch {
      return "denied";
    }
  }, [updatePreferences]);

  const showNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted" && preferences.pushEnabled) {
      try {
        new Notification(title, options);
      } catch {
        // fallback or error handling
      }
    }
  }, [preferences.pushEnabled]);

  return {
    preferences,
    permission,
    updatePreferences,
    requestPermission,
    showNotification,
  };
}
