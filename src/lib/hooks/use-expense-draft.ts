"use client";

import { useState, useEffect, useCallback } from "react";
import { getLocalStorageDraft, saveLocalStorageDraft, clearLocalStorageDraft, type ExpenseDraft } from "../useLocalStorageDraft";

export function useExpenseDraft(groupId: string) {
  const storageKey = `mergepay:expense_draft:${groupId}`;
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [isRestored, setIsRestored] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || !groupId) return;
    const { restored, data } = getLocalStorageDraft<ExpenseDraft>(storageKey);
    if (restored && data) {
      if (data.title || data.amount || data.description || data.memo) {
        setDraft(data);
        setIsRestored(true);
      }
    }
  }, [storageKey, groupId]);

  const saveDraft = useCallback(
    (newDraft: ExpenseDraft) => {
      if (typeof window === "undefined" || !groupId) return;
      const draftWithTime = { ...newDraft, updatedAt: Date.now() };
      saveLocalStorageDraft(storageKey, draftWithTime);
      setDraft(draftWithTime);
    },
    [storageKey, groupId]
  );

  const clearDraft = useCallback(() => {
    if (typeof window === "undefined" || !groupId) return;
    clearLocalStorageDraft(storageKey);
    setDraft(null);
    setIsRestored(false);
  }, [storageKey, groupId]);

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
