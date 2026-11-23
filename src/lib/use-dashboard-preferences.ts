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
  const [hydratedUser, setHydratedUser] = useState<string | null>(null);

  useEffect(() => {
    setPreferences(loadDashboardPreferences(userId));
    setHydratedUser(userId ?? "anonymous");
  }, [userId]);

  useEffect(() => {
    if (hydratedUser === (userId ?? "anonymous")) saveDashboardPreferences(preferences, userId);
  }, [preferences, userId, hydratedUser]);

  function updatePreferences(patch: Partial<DashboardPreferences>) {
    setPreferences((previous) => ({ ...previous, ...patch }));
  }

  return { preferences, updatePreferences, hydrated: hydratedUser === (userId ?? "anonymous") };
}
