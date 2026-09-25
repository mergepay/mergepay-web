"use client";

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  currencyDisplay: "token" | "fiat" | "both";
  compactView: boolean;
  defaultCurrency: string;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: "light",
  currencyDisplay: "both",
  compactView: false,
  defaultCurrency: "USD",
};

const PREFERENCES_STORAGE_KEY = "mergepay.user_preferences";

export function getStoredUserPreferences(): UserPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_USER_PREFERENCES;
  }
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_USER_PREFERENCES,
      ...(typeof parsed === "object" && parsed !== null ? parsed : {}),
    };
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
}

export function setStoredUserPreferences(prefs: Partial<UserPreferences>): UserPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_USER_PREFERENCES;
  }
  try {
    const current = getStoredUserPreferences();
    const next = { ...current, ...prefs };
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return getStoredUserPreferences();
  }
}
