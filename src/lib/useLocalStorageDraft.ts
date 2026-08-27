import { useState, useEffect, useCallback } from "react";

export interface ExpenseDraft {
  title: string;
  description: string;
  amount: string;
  fiatCurrency: string;
  fiatAmount: string;
  rateOverride: string;
  assetKey: string;
  payerUserId: string;
  splitType: string;
  participants: string[];
  custom: Record<string, string>;
  percent: Record<string, string>;
  memo: string;
  updatedAt?: number;
}

const STORAGE_PREFIX = "mergepay:expense_draft:";

export function useLocalStorageDraft(groupId: string) {
  const key = `${STORAGE_PREFIX}${groupId}`;
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [isRestored, setIsRestored] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || !groupId) return;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as ExpenseDraft;
        if (parsed.title || parsed.amount || parsed.description || parsed.memo) {
          setDraft(parsed);
          setIsRestored(true);
        }
      }
    } catch (e) {
      console.warn("Failed to load expense draft from localStorage:", e);
    }
  }, [key, groupId]);

  const saveDraft = useCallback(
    (newDraft: ExpenseDraft) => {
      if (typeof window === "undefined" || !groupId) return;
      try {
        const draftWithTime = { ...newDraft, updatedAt: Date.now() };
        window.localStorage.setItem(key, JSON.stringify(draftWithTime));
        setDraft(draftWithTime);
      } catch (e) {
        console.warn("Storage quota exceeded or error saving draft:", e);
      }
    },
    [key, groupId]
  );

  const clearDraft = useCallback(() => {
    if (typeof window === "undefined" || !groupId) return;
    try {
      window.localStorage.removeItem(key);
      setDraft(null);
      setIsRestored(false);
    } catch (e) {
      console.warn("Failed to clear expense draft from localStorage:", e);
    }
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
  };
}