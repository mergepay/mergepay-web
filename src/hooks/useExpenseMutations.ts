"use client";

/**
 * Group expense & settlement mutations with optimistic cache updates (#375).
 *
 * Every mutation follows the same React Query recipe:
 *
 *  1. `onMutate`  — cancel in-flight refetches, snapshot the affected cache
 *     entries, write the predicted result, return the snapshot as context.
 *  2. `onError`   — put the snapshots back (rollback) and tell the user.
 *  3. `onSettled` — invalidate so the server's canonical data replaces the
 *     prediction.
 *
 * The data shaping itself lives in `src/lib/optimistic.ts` so it can be unit
 * tested without a React tree.
 */

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  calculateOptimisticBalances,
  expenseCacheKeys,
  qk,
  useInvalidator,
  useMe,
} from "@/lib/queries";
import { handleApiError } from "@/lib/errorHandler";
import { useAuth } from "@/lib/auth-store";
import {
  calculateOptimisticActivityList,
  createOptimisticExpenseEvent,
} from "@/lib/activity";
import {
  applyOptimisticSettlement,
  buildOptimisticExpense,
  insertOptimisticExpense,
} from "@/lib/optimistic";
import type {
  BalancesResponse,
  CreateExpenseRequest,
  CreateSettlementRequest,
  Expense,
  ExpenseResponse,
  GroupActivityResponse,
  GroupDetail,
  SettlementIntentResponse,
  User,
} from "@/lib/types";

/** The query keys an expense write can touch (prefix-matched). */
function expenseWriteKeys(groupId: string): readonly QueryKey[] {
  return [qk.expenses(groupId), qk.balances(groupId), qk.activity(groupId)];
}

/**
 * The signed-in user, falling back to the persisted store so the optimistic
 * payload still renders when the `me` query has not resolved yet.
 */
function currentUser(me: { user?: User } | undefined): User | null {
  return me?.user ?? useAuth.getState().user ?? null;
}

export function useCreateExpenseMutation(groupId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidator();
  const me = useMe();

  return useMutation({
    mutationFn: (data: CreateExpenseRequest): Promise<ExpenseResponse> => {
      return api.createExpense(groupId, data);
    },

    onMutate: async (data: CreateExpenseRequest) => {
      const keys = expenseWriteKeys(groupId);

      // Stop any in-flight refetch from clobbering the prediction.
      await Promise.all(keys.map((queryKey) => qc.cancelQueries({ queryKey })));

      const previousExpenses = qc.getQueriesData({ queryKey: qk.expenses(groupId) });
      const previousBalances = qc.getQueryData<BalancesResponse>(qk.balances(groupId));
      const previousActivity = qc.getQueryData<GroupActivityResponse>(qk.activity(groupId));

      const payer = currentUser(me.data);
      let optimisticId: string | undefined;

      // Show the new expense immediately, flagged so the card renders it
      // dimmed with a "Saving…" badge until the server confirms it.
      if (payer) {
        const detail = qc.getQueryData<GroupDetail>(qk.group(groupId));
        const memberById = new Map(
          (detail?.members ?? []).map((m) => [m.userId, m.user])
        );
        const optimistic: Expense = buildOptimisticExpense({
          groupId,
          request: data,
          payer,
          resolveUser: (userId) =>
            memberById.get(userId) ?? (payer.id === userId ? payer : undefined),
        });
        optimisticId = optimistic.id;
        qc.setQueriesData({ queryKey: qk.expenses(groupId) }, (old: unknown) =>
          insertOptimisticExpense(old, optimistic)
        );
      }

      // Predicted balances + activity feed, matching useCreateExpense.
      if (previousBalances) {
        const payerUserId = data.payerUserId || payer?.id || "";
        qc.setQueryData<BalancesResponse>(qk.balances(groupId), (old) =>
          old ? calculateOptimisticBalances(old, data, payerUserId) : old
        );
      }

      const optEvent = createOptimisticExpenseEvent(
        groupId,
        data,
        payer
          ? {
              id: payer.id,
              displayName: payer.displayName,
              avatarUrl: payer.avatarUrl,
            }
          : undefined
      );
      qc.setQueryData<GroupActivityResponse>(qk.activity(groupId), (old) =>
        calculateOptimisticActivityList(old, optEvent)
      );

      return { previousExpenses, previousBalances, previousActivity, optimisticId };
    },

    onError: (err, _data, context) => {
      // Roll back every entry we wrote, newest first is irrelevant — each
      // snapshot is an independent key.
      if (context?.previousExpenses) {
        for (const [queryKey, queryData] of context.previousExpenses) {
          qc.setQueryData(queryKey, queryData);
        }
      }
      if (context?.previousBalances) {
        qc.setQueryData(qk.balances(groupId), context.previousBalances);
      }
      if (context?.previousActivity) {
        qc.setQueryData(qk.activity(groupId), context.previousActivity);
      }
      handleApiError(err, "Failed to create expense");
    },

    onSuccess: () => {
      invalidate(expenseCacheKeys(groupId));
      qc.invalidateQueries({ queryKey: qk.activity(groupId) });
      qc.invalidateQueries({ queryKey: qk.history });
      toast.success("Expense created successfully");
    },

    onSettled: () => {
      // Whether it succeeded or failed, the server's list wins over the
      // optimistic entry.
      invalidate([qk.expenses(groupId)]);
    },
  });
}

export function useSettleBalanceMutation(groupId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidator();
  const me = useMe();

  return useMutation({
    mutationFn: (data: CreateSettlementRequest): Promise<SettlementIntentResponse> => {
      return api.createSettlement(groupId, data);
    },

    onMutate: async (newSettlement: CreateSettlementRequest) => {
      toast.success("Initiating settlement...");
      const balancesKey = qk.balances(groupId);

      await Promise.all(
        expenseWriteKeys(groupId).map((queryKey) =>
          qc.cancelQueries({ queryKey })
        )
      );

      const previousQueries = qc.getQueriesData({ queryKey: balancesKey });
      const previousBalances = qc.getQueryData<BalancesResponse>(balancesKey);
      const payer = currentUser(me.data);

      // Move the funds between the two members straight away: the signed
      // netBalance flips the payer up by `amount` and the payee down by it,
      // so "settle up" reads correct before the network answers. The
      // rollback below (or the invalidation on success) replaces it with
      // the server's number.
      if (previousBalances && payer) {
        qc.setQueryData<BalancesResponse>(balancesKey, (old) =>
          old
            ? applyOptimisticSettlement(old, {
                fromUserId: payer.id,
                toUserId: newSettlement.toUserId,
                amount: newSettlement.amount,
                assetCode: newSettlement.assetCode,
              })
            : old
        );
      }

      return { previousQueries, previousBalances };
    },

    onError: (err, _newSettlement, context) => {
      if (context?.previousQueries) {
        for (const [queryKey, queryData] of context.previousQueries) {
          qc.setQueryData(queryKey, queryData);
        }
      }
      if (context?.previousBalances) {
        qc.setQueryData(qk.balances(groupId), context.previousBalances);
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
