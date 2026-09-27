"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  qk,
  useInvalidator,
  expenseCacheKeys,
  calculateOptimisticBalances,
} from "@/lib/queries";
import {
  buildOptimisticExpense,
  prependOptimisticExpense,
  restoreExpenseQueries,
  snapshotExpenseQueries,
} from "@/lib/expenseOptimistic";
import { handleApiError } from "@/lib/errorHandler";
import { useAuth } from "@/lib/auth-store";
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
    // Land the expense in the cached list (and the derived balances) before
    // the network round-trip resolves, so the UI never waits on the server (#488).
    onMutate: async (data: CreateExpenseRequest) => {
      const expensesKey = qk.expenses(groupId);
      const balancesKey = qk.balances(groupId);

      await Promise.all([
        qc.cancelQueries({ queryKey: expensesKey }),
        qc.cancelQueries({ queryKey: balancesKey }),
      ]);

      const previousExpenses = snapshotExpenseQueries(qc, expensesKey);
      const previousBalances = qc.getQueryData<BalancesResponse>(balancesKey);

      if (previousBalances) {
        const payerUserId =
          data.payerUserId || useAuth.getState().user?.id || "";
        qc.setQueryData<BalancesResponse>(balancesKey, (old) =>
          old ? calculateOptimisticBalances(old, data, payerUserId) : old
        );
      }

      prependOptimisticExpense(
        qc,
        expensesKey,
        buildOptimisticExpense(groupId, data, useAuth.getState().user)
      );

      return { previousExpenses, previousBalances };
    },
    // Put every touched cache back exactly as it was, then surface the failure.
    onError: (err, _variables, context) => {
      if (context?.previousExpenses) {
        restoreExpenseQueries(qc, context.previousExpenses);
      }
      if (context?.previousBalances) {
        qc.setQueryData(qk.balances(groupId), context.previousBalances);
      }
      handleApiError(err, "Failed to create expense");
    },
    onSuccess: () => {
      toast.success("Expense created successfully");
    },
    onSettled: () => {
      invalidate(expenseCacheKeys(groupId));
      qc.invalidateQueries({ queryKey: qk.activity(groupId) });
      qc.invalidateQueries({ queryKey: qk.history });
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

      // Match by the group's expense/balance *prefix* — these keys are what
      // actually prefix `["groups", id, "expenses"]` / `["groups", id,
      // "balances"]`. `expenseCacheKeys()` returns a mixed list of filters
      // meant for `invalidate`, and as a `queryKey` it matches nothing.
      const expensesKey = qk.expenses(groupId);
      const balancesKey = qk.balances(groupId);

      await Promise.all([
        qc.cancelQueries({ queryKey: expensesKey }),
        qc.cancelQueries({ queryKey: balancesKey }),
      ]);

      const previousQueries = [
        ...qc.getQueriesData({ queryKey: expensesKey }),
        ...qc.getQueriesData({ queryKey: balancesKey }),
      ];

      // Optimistically update any expense pages or lists in the cache for this group
      qc.setQueriesData({ queryKey: expensesKey }, (old: any) => {
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
      // Log the underlying failure for diagnosis (no key material or
      // private payloads are included) and tell the user what happened.
      console.error("[mergepay] settlement failed, balances rolled back:", err);
      toast.error("Settlement failed. Balances rolled back.");
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
