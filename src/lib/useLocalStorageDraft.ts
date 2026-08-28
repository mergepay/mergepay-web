import { useState, useEffect, useCallback, useRef } from "react";

export function getLocalStorageDraft<T>(key: string): { restored: boolean; data: T | null } {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const item = window.localStorage.getItem(key);
      if (item) {
        return { restored: true, data: JSON.parse(item) as T };
      }
    }
  } catch (error) {
    console.warn(`Error reading localStorage key "${key}":`, error);
  }
  return { restored: false, data: null };
}

export function saveLocalStorageDraft<T>(key: string, draft: T): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(draft));
    }
  } catch (error) {
    console.warn(`Error setting localStorage key "${key}":`, error);
  }
}

export function clearLocalStorageDraft(key: string): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn(`Error removing localStorage key "${key}":`, error);
  }
}

export function useLocalStorageDraft<T>(key: string, initialValue: T, delay = 500) {
  const [draft, setDraft] = useState<T>(initialValue);
  const [isRestored, setIsRestored] = useState(false);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const { restored, data } = getLocalStorageDraft<T>(key);
    if (restored && data) {
      setDraft(data);
      setIsRestored(true);
    }
  }, [key]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const handler = setTimeout(() => {
      saveLocalStorageDraft(key, draft);
    }, delay);

    return () => clearTimeout(handler);
  }, [draft, key, delay]);

  const clearDraft = useCallback(() => {
    clearLocalStorageDraft(key);
    setDraft(initialValue);
    setIsRestored(false);
  }, [key, initialValue]);

  const dismissRestored = useCallback(() => {
    setIsRestored(false);
  }, []);

  return { draft, setDraft, isRestored, clearDraft, dismissRestored };
}
