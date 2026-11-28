"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "mergepay-theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // private browsing or storage disabled
  }
  return "system";
}

function resolveTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? getSystemTheme() : theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializers read the persisted/system theme on the first client
  // render, matching the class the pre-paint script in the root layout
  // already applied — no post-hydration theme snap.
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window === "undefined" ? "system" : getStoredTheme()
  );
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    typeof window === "undefined" ? "light" : resolveTheme(getStoredTheme())
  );

  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    setResolvedTheme(resolveTheme(stored));
  }, []);

  useEffect(() => {
    const resolved = theme === "system" ? getSystemTheme() : theme;
    setResolvedTheme(resolved);

    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);

    // Listen for system preference changes when in "system" mode
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => {
        const next = e.matches ? "dark" : "light";
        setResolvedTheme(next);
        root.classList.remove("light", "dark");
        root.classList.add(next);
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
