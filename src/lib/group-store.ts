"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface GroupState {
  selectedGroupId: string | null;
  recentGroupIds: string[];
  restored: boolean;
  setSelectedGroup: (id: string | null) => void;
  addRecentGroup: (id: string) => void;
  clearRecentGroups: () => void;
  setRestored: (v: boolean) => void;
  clear: () => void;
}

function safeStorage(): Storage {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      length: 0,
      clear: () => {},
      key: () => null,
    };
  }
  try {
    return localStorage;
  } catch {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      length: 0,
      clear: () => {},
      key: () => null,
    };
  }
}

export const useGroupStore = create<GroupState>()(
  persist(
    (set) => ({
      selectedGroupId: null,
      recentGroupIds: [],
      restored: false,
      setSelectedGroup: (id) =>
        set((state) => {
          if (!id) return { selectedGroupId: null };
          const updated = [id, ...state.recentGroupIds.filter((gId) => gId !== id)].slice(0, 10);
          return { selectedGroupId: id, recentGroupIds: updated };
        }),
      addRecentGroup: (id) =>
        set((state) => {
          if (!id) return {};
          const updated = [id, ...state.recentGroupIds.filter((gId) => gId !== id)].slice(0, 10);
          return { recentGroupIds: updated };
        }),
      clearRecentGroups: () => set({ recentGroupIds: [] }),
      setRestored: (v) => set({ restored: v }),
      clear: () => set({ selectedGroupId: null }),
    }),
    {
      name: "mergepay.selectedGroup",
      storage: createJSONStorage(() => safeStorage()),
      partialize: (s) => ({
        selectedGroupId: s.selectedGroupId,
        recentGroupIds: s.recentGroupIds,
      }),
      version: 1,
      onRehydrateStorage: () => (state) => {
        state?.setRestored(true);
      },
    }
  )
);
