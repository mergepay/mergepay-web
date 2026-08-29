"use client";

/**
 * Per-group budget settings for the group budget tracker (#248).
 *
 * Budgets are configured by group admins and persisted locally (zustand
 * persist → localStorage). A per-group `warned` set stops the 80% / 100%
 * warning toasts from re-firing on every render — they only re-arm when the
 * budget is edited or cleared.
 *
 * Note: the API has no budget endpoint yet, so this is local state only.
 * The shape is intentionally small so a future `PATCH /groups/:id/budget`
 * can adopt it as-is.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SupportedFiatCurrency } from "./currency";
import type { BudgetThreshold } from "./budgets";

export interface GroupBudgetConfig {
  /** Spending cap, denominated in `currency`. */
  limit: number;
  currency: SupportedFiatCurrency;
  /** Thresholds already announced via toast, so they don't re-fire. */
  warned: BudgetThreshold[];
}

interface GroupBudgetState {
  budgets: Record<string, GroupBudgetConfig>;
  /** Set or update a group's budget; re-arms the warning thresholds. */
  setBudget: (
    groupId: string,
    limit: number,
    currency: SupportedFiatCurrency
  ) => void;
  clearBudget: (groupId: string) => void;
  /** Remember that a threshold was announced for this group. */
  markWarned: (groupId: string, threshold: BudgetThreshold) => void;
}

export const useGroupBudgetStore = create<GroupBudgetState>()(
  persist(
    (set) => ({
      budgets: {},

      setBudget: (groupId, limit, currency) =>
        set((state) => ({
          budgets: {
            ...state.budgets,
            [groupId]: {
              limit: Number.isFinite(limit) && limit > 0 ? limit : 0,
              currency,
              warned: [],
            },
          },
        })),

      clearBudget: (groupId) =>
        set((state) => {
          const { [groupId]: _removed, ...rest } = state.budgets;
          return { budgets: rest };
        }),

      markWarned: (groupId, threshold) =>
        set((state) => {
          const config = state.budgets[groupId];
          if (!config || config.warned.includes(threshold)) return state;
          return {
            budgets: {
              ...state.budgets,
              [groupId]: {
                ...config,
                warned: [...config.warned, threshold],
              },
            },
          };
        }),
    }),
    {
      name: "mergepay:group-budgets",
      version: 1,
    }
  )
);
