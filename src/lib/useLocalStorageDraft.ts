import { useState, useEffect, useCallback } from "react";

export interface ExpenseDraft {
  title: string;
  description: string;
  amount: string;
  fiatCurrency?: string;
  fiatAmount?: string;
  rateOverride?: string;
  assetKey: string;
  payerUserId: string;
  splitType: string;
  participants: string[];
  custom: Record<string, string>;
  percent: Record<string, string>;
  memo: string;
  receiptUrl?: string | null;
  updatedAt?: number;
}

const STORAGE_PREFIX = "mergepay:expense_draft:";

export function getLocalStorageDraft<T = Record<string, string>>(
  key: string
): { restored: boolean; data: T | null } {
  if (typeof window === "undefined" || !window.localStorage) {
    return { restored: false, data: null };
  }
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) {
      return { restored: false, data: null };
    }
    const parsed = JSON.parse(stored) as T;
    return { restored: true, data: parsed };
  } catch (e) {
    console.warn(`Error reading localStorage key "${key}":`, e);
    return { restored: false, data: null };
  }
}

export function saveLocalStorageDraft<T = Record<string, unknown>>(
  key: string,
  data: T
): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn(`Error setting localStorage key "${key}":`, e);
  }
}

export function clearLocalStorageDraft(key: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch (e) {
    console.warn(`Error removing localStorage key "${key}":`, e);
  }
}

export function useLocalStorageDraft(groupId: string) {
  const key = `${STORAGE_PREFIX}${groupId}`;
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [isRestored, setIsRestored] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || !groupId) return;
    const { restored, data } = getLocalStorageDraft<ExpenseDraft>(key);
    if (restored && data) {
      if (data.title || data.amount || data.description || data.memo) {
        setDraft(data);
        setIsRestored(true);
      }
    }
  }, [key, groupId]);

  const saveDraft = useCallback(
    (newDraft: ExpenseDraft) => {
      if (typeof window === "undefined" || !groupId) return;
      const draftWithTime = { ...newDraft, updatedAt: Date.now() };
      saveLocalStorageDraft(key, draftWithTime);
      setDraft(draftWithTime);
    },
    [key, groupId]
  );

  const clearDraft = useCallback(() => {
    if (typeof window === "undefined" || !groupId) return;
    clearLocalStorageDraft(key);
    setDraft(null);
    setIsRestored(false);
  }, [key, groupId]);

  const acknowledgeRestored = useCallback(() => {
    setIsRestored(false);
  }, []);

  return {
    draft,
    isRestored,
    saveDraft,
    clearDraft,
    acknowledgeRestored,
    dismissRestored: acknowledgeRestored,
  };
}
