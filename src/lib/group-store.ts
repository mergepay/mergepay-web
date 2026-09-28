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

/**
 * Hoists the persisted active group to the front of the list so a reload
 * lands the user back where they were (#494). Order is otherwise untouched,
 * and an unknown or absent selection returns the input unchanged.
 */
export function orderGroupsByActive<T extends { id: string }>(
  groups: T[],
  activeGroupId: string | null | undefined
): T[] {
  if (!activeGroupId) return groups;
  const activeIndex = groups.findIndex((group) => group.id === activeGroupId);
  if (activeIndex <= 0) return groups;
  return [
    groups[activeIndex],
    ...groups.slice(0, activeIndex),
    ...groups.slice(activeIndex + 1),
  ];
}
