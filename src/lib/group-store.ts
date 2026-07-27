"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface GroupState {
  selectedGroupId: string | null;
  restored: boolean;
  setSelectedGroup: (id: string | null) => void;
  setRestored: (v: boolean) => void;
  clear: () => void;
}

function safeStorage(): Storage {
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
      restored: false,
      setSelectedGroup: (id) => set({ selectedGroupId: id }),
      setRestored: (v) => set({ restored: v }),
      clear: () => set({ selectedGroupId: null }),
    }),
    {
      name: "mergepay.selectedGroup",
      storage: createJSONStorage(() => safeStorage()),
      partialize: (s) => ({ selectedGroupId: s.selectedGroupId }),
      version: 1,
      onRehydrateStorage: () => (state) => {
        state?.setRestored(true);
      },
    }
  )
);
