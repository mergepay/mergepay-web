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
  const memoryFallback = new Map<string, string>();
  const getBackend = (): Storage | null => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage ?? null;
    } catch {
      return null;
    }
  };

  return {
    getItem: (key: string) => {
      const backend = getBackend();
      if (backend) {
        try {
          const val = backend.getItem(key);
          if (val !== null) return val;
        } catch {
          // Fall back to in-memory storage when reads throw.
        }
      }
      return memoryFallback.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      memoryFallback.set(key, value);
      const backend = getBackend();
      if (!backend) return;
      try {
        backend.setItem(key, value);
      } catch {
        // Ignore QuotaExceededError / SecurityError in private browsing.
      }
    },
    removeItem: (key: string) => {
      memoryFallback.delete(key);
      const backend = getBackend();
      if (!backend) return;
      try {
        backend.removeItem(key);
      } catch {
        // Ignore restricted storage errors.
      }
    },
    clear: () => {
      memoryFallback.clear();
      const backend = getBackend();
      if (!backend) return;
      try {
        backend.clear();
      } catch {
        // Ignore restricted storage errors.
      }
    },
    key: (index: number) => {
      const backend = getBackend();
      if (backend) {
        try {
          return backend.key(index);
        } catch {
          // Fall back to in-memory keys.
        }
      }
      return Array.from(memoryFallback.keys())[index] ?? null;
    },
    get length() {
      const backend = getBackend();
      if (backend) {
        try {
          return backend.length;
        } catch {
          // Fall back to in-memory size.
        }
      }
      return memoryFallback.size;
    },
  };
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
      // Full reset for sign-out / session expiry (#898): the active group and
      // the recent list both describe the account that is leaving, so neither
      // may leak into the next session.
      clear: () => set({ selectedGroupId: null, recentGroupIds: [] }),
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
