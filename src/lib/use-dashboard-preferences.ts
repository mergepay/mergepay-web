"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_DASHBOARD_PREFERENCES,
  dashboardPreferencesKey,
  loadDashboardPreferences,
  saveDashboardPreferences,
  validateDashboardPreferences,
  type DashboardPreferences,
} from "./dashboard-preferences";

/** Hydrates after mount to avoid SSR/client markup mismatches and syncs across tabs. */
export function useDashboardPreferences(userId?: string) {
  const [preferences, setPreferences] = useState<DashboardPreferences>(
    DEFAULT_DASHBOARD_PREFERENCES,
  );
  const [hydratedUser, setHydratedUser] = useState<string | null>(null);

  useEffect(() => {
    setPreferences(loadDashboardPreferences(userId));
    setHydratedUser(userId ?? "anonymous");
  }, [userId]);

  useEffect(() => {
    if (hydratedUser === (userId ?? "anonymous")) saveDashboardPreferences(preferences, userId);
  }, [preferences, userId, hydratedUser]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
      return;
    }
    const targetKey = dashboardPreferencesKey(userId);
    const onStorage = (event: StorageEvent) => {
      try {
        if (event.key !== null && event.key !== targetKey) return;
        if (event.key === null || event.newValue === null) {
          setPreferences({ ...DEFAULT_DASHBOARD_PREFERENCES });
          return;
        }
        setPreferences(validateDashboardPreferences(JSON.parse(event.newValue) as unknown));
      } catch {
        setPreferences({ ...DEFAULT_DASHBOARD_PREFERENCES });
      }
    };
    try {
      window.addEventListener("storage", onStorage);
      return () => {
        try {
          window.removeEventListener("storage", onStorage);
        } catch {
          // Ignore teardown errors in restricted environments.
        }
      };
    } catch {
      return;
    }
  }, [userId]);

  function updatePreferences(patch: Partial<DashboardPreferences>) {
    setPreferences((previous) => ({ ...previous, ...patch }));
  }

  return { preferences, updatePreferences, hydrated: hydratedUser === (userId ?? "anonymous") };
}
