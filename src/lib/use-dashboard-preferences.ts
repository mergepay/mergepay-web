"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_DASHBOARD_PREFERENCES,
  loadDashboardPreferences,
  saveDashboardPreferences,
  type DashboardPreferences,
} from "./dashboard-preferences";

/** Hydrates after mount to avoid SSR/client markup mismatches. */
export function useDashboardPreferences(userId?: string) {
  const [preferences, setPreferences] = useState<DashboardPreferences>(
    DEFAULT_DASHBOARD_PREFERENCES,
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(false);
    setPreferences(loadDashboardPreferences(userId));
    setHydrated(true);
  }, [userId]);

  useEffect(() => {
    if (hydrated) saveDashboardPreferences(preferences, userId);
  }, [preferences, userId, hydrated]);

  function updatePreferences(patch: Partial<DashboardPreferences>) {
    setPreferences((previous) => ({ ...previous, ...patch }));
  }

  return { preferences, updatePreferences, hydrated };
}
