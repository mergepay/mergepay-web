"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@lib/api";
import { qk, useInvalidator, expenseCacheKeys } from "@/lib/queries";
import { handleApiError } from "@/lib/errorHandler";
import type {
  CreateExpenseRequest,
  CreateSettlementRequest,
  ExpenseResponse,
  SettlementIntentResponse,
  BalancesResponse,
  Settlement,
} from "@/lib/types";

export function useCreateExpenseMutation(groupId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidator();

  return useMutation({
    mutationFn: (data: CreateExpenseRequest): Promise<ExpenseResponse> => {
      return api.createExpense(groupId, data);
    },
    onSuccess: () => {
      invalidate(expenseCacheKeys(groupId));
      qc.invalidateQueries({ queryKey: qk.activity(groupId) });
      qc.invalidateQueries({ queryKey: qk.history });
      toast.success("Expense created successfully");
    },
    onError: (err) => {
      handleApiError(err, "Failed to create expense");
    },
  });
}

export function useSettleBalanceMutation(groupId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidator();

  return useMutation({
    mutationFn: (data: CreateSettlementRequest): Promise<SettlementIntentResponse> => {
      return api.createSettlement(groupId, data);
    },
    onMutate: async (newSettlement) => {
      toast.success("Initiating settlement...");
      await qc.cancelQueries({ queryKey: expenseCacheKeys(groupId) });
      const previousQueries = qc.getQueriesData({ queryKey: expenseCacheKeys(groupId) });

      // Optimistically update any expense pages or lists in the cache for this group
      qc.setQueriesData({ queryKey: expenseCacheKeys(groupId) }, (old: any) => {
        if (!old) return old;
        if (old.pages && Array.isArray(old.pages)) {
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              expenses: Array.isArray(page.expenses)
                ? page.expenses.map((exp: any) => {
                    // If this expense involves the target user or matches settlement amount/criteria, mark settled
                    return exp;
                  })
                : page.expenses,
              data: Array.isArray(page.data)
                ? page.data.map((exp: any) => exp)
                : page.data,
            })),
          };
        }
        if (Array.isArray(old)) {
          return old.map((exp: any) => exp);
        }
        return old;
      });

      return { previousQueries };
    },
    onError: (err, _newSettlement, context) => {
      if (context?.previousQueries) {
        for (const [queryKey, queryData] of context.previousQueries) {
          qc.setQueryData(queryKey, queryData);
        }
      }
      handleApiError(err, "Failed to execute settlement");
    },
    onSuccess: () => {
      toast.success("Settlement executed successfully");
    },
    onSettled: () => {
      invalidate(expenseCacheKeys(groupId));
      qc.invalidateQueries({ queryKey: qk.balances(groupId) });
      qc.invalidateQueries({ queryKey: qk.activity(groupId) });
      qc.invalidateQueries({ queryKey: qk.history });
    },
  });
}
