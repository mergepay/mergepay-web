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

import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
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
  createOptimisticSettlementEvent,
} from "@/lib/activity";
import {
  applyOptimisticSettlement,
  buildOptimisticExpense,
  calculateOptimisticBalances,
  findExpenseInCaches,
  insertOptimisticExpense,
  patchOptimisticExpense,
  removeOptimisticExpense,
  reverseOptimisticExpenseBalances,
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
  UpdateExpenseRequest,
  User,
} from "@/lib/types";

type QuerySnapshot = ReadonlyArray<readonly [QueryKey, unknown]>;

/** Put back every cache entry captured by `getQueriesData`. */
function restoreSnapshots(qc: QueryClient, snapshot: QuerySnapshot | undefined): void {
  if (!snapshot) return;
  for (const [queryKey, queryData] of snapshot) {
    qc.setQueryData(queryKey, queryData);
  }
}

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
      const balancesKey = qk.balances(groupId);

      await Promise.all(
        expenseWriteKeys(groupId).map((queryKey) =>
          qc.cancelQueries({ queryKey })
        )
      );

      const previousQueries = qc.getQueriesData({ queryKey: balancesKey });
      const previousBalances = qc.getQueryData<BalancesResponse>(balancesKey);
      const previousActivity = qc.getQueryData<GroupActivityResponse>(qk.activity(groupId));
      const previousExpenses = qc.getQueriesData({ queryKey: qk.expenses(groupId) });
      const payer = currentUser(me.data);

      const detail = qc.getQueryData<GroupDetail>(qk.group(groupId));
      const recipient = detail?.members.find((member) => member.userId === newSettlement.toUserId)?.user;
      const optimisticActivity = createOptimisticSettlementEvent(
        groupId,
        newSettlement,
        payer
          ? { id: payer.id, displayName: payer.displayName, avatarUrl: payer.avatarUrl }
          : undefined,
        recipient
          ? { id: recipient.id, displayName: recipient.displayName, avatarUrl: recipient.avatarUrl }
          : undefined
      );
      qc.setQueryData<GroupActivityResponse>(qk.activity(groupId), (old) =>
        calculateOptimisticActivityList(old, optimisticActivity)
      );

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

      return { previousQueries, previousBalances, previousActivity, previousExpenses };
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
      if (context?.previousActivity) {
        qc.setQueryData(qk.activity(groupId), context.previousActivity);
      }
      if (context?.previousExpenses) {
        for (const [queryKey, queryData] of context.previousExpenses) {
          qc.setQueryData(queryKey, queryData);
        }
      }
      handleApiError(err, "Settlement failed. Balances rolled back.");
    },

    onSuccess: (data) => {
      const status = data?.settlement?.status ?? "executed successfully";
      toast.success(`Settlement ${status}`);
    },

    onSettled: () => {
      // `expenseCacheKeys` already covers balances and ledger; invalidating
      // balances again here would only double the refetch on success.
      invalidate(expenseCacheKeys(groupId));
      qc.invalidateQueries({ queryKey: qk.activity(groupId) });
      qc.invalidateQueries({ queryKey: qk.history });
    },
  });
}

export function useDeleteExpenseMutation(groupId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidator();

  return useMutation({
    mutationFn: async (expenseId: string): Promise<void> => {
      await api.deleteExpense(groupId, expenseId);
    },

    onMutate: async (expenseId: string) => {
      const keys = expenseWriteKeys(groupId);

      // Stop any in-flight refetch from clobbering the removal.
      await Promise.all(keys.map((queryKey) => qc.cancelQueries({ queryKey })));

      await qc.cancelQueries({ queryKey: qk.history });

      const previousExpenses = qc.getQueriesData({ queryKey: qk.expenses(groupId) });
      const previousHistory = qc.getQueriesData({ queryKey: qk.history });
      const previousActivity = qc.getQueryData<GroupActivityResponse>(qk.activity(groupId));
      const previousBalances = qc.getQueryData<BalancesResponse>(qk.balances(groupId));

      // Balance summaries derive from the expense list, so reverse this
      // expense's contribution before the card disappears (#818).
      const removed = findExpenseInCaches(previousExpenses, expenseId);
      if (previousBalances && removed) {
        qc.setQueryData<BalancesResponse>(qk.balances(groupId), (old) =>
          old ? reverseOptimisticExpenseBalances(old, removed) : old
        );
      }

      // Remove the expense from both flat and infinite cache shapes
      // immediately so the card disappears before the network responds —
      // in the group list and in the cross-group history view alike.
      qc.setQueriesData({ queryKey: qk.expenses(groupId) }, (old: unknown) =>
        removeOptimisticExpense(old, expenseId)
      );
      qc.setQueriesData({ queryKey: qk.history }, (old: unknown) =>
        removeOptimisticExpense(old, expenseId)
      );

      return { previousExpenses, previousHistory, previousActivity, previousBalances };
    },

    onError: (err, _expenseId, context) => {
      // Restore every entry we emptied.
      restoreSnapshots(qc, context?.previousExpenses);
      restoreSnapshots(qc, context?.previousHistory);
      if (context?.previousActivity) {
        qc.setQueryData(qk.activity(groupId), context.previousActivity);
      }
      if (context?.previousBalances) {
        qc.setQueryData(qk.balances(groupId), context.previousBalances);
      }
      toast.error("Could not delete expense. It has been restored.");
    },

    onSuccess: () => {
      invalidate(expenseCacheKeys(groupId));
      qc.invalidateQueries({ queryKey: qk.activity(groupId) });
      qc.invalidateQueries({ queryKey: qk.history });
      toast.success("Expense deleted successfully");
    },

    onSettled: () => {
      // Always reconcile with the server's list.
      invalidate(expenseCacheKeys(groupId));
      qc.invalidateQueries({ queryKey: qk.activity(groupId) });
    },
  });
}

export interface UpdateExpenseVariables {
  expenseId: string;
  data: UpdateExpenseRequest;
}

/**
 * Edit an expense's title, description, memo or receipt with an optimistic
 * cache update (#892).
 *
 *  1. `onMutate`  — cancel in-flight refetches of the group's expense list and
 *     the history feed, snapshot them, and merge the edit into every cached
 *     copy (flagged `pending` so the card shows "Saving…").
 *  2. `onError`   — restore the snapshots and tell the user the edit was
 *     reverted.
 *  3. `onSuccess` — swap the prediction for the server's copy.
 *  4. `onSettled` — invalidate so the canonical list replaces everything.
 */
export function useUpdateExpenseMutation(groupId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidator();

  return useMutation({
    mutationFn: ({ expenseId, data }: UpdateExpenseVariables): Promise<ExpenseResponse> =>
      api.updateExpense(expenseId, data),

    onMutate: async ({ expenseId, data }: UpdateExpenseVariables) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: qk.expenses(groupId) }),
        qc.cancelQueries({ queryKey: qk.history }),
      ]);

      const previousExpenses = qc.getQueriesData({ queryKey: qk.expenses(groupId) });
      const previousHistory = qc.getQueriesData({ queryKey: qk.history });

      const patch = {
        title: data.title,
        // An emptied optional field is stored as null by the server.
        description: data.description === undefined ? undefined : data.description || null,
        memo: data.memo === undefined ? undefined : data.memo || null,
        receiptUrl: data.receiptUrl,
      };
      qc.setQueriesData({ queryKey: qk.expenses(groupId) }, (old: unknown) =>
        patchOptimisticExpense(old, expenseId, patch)
      );
      qc.setQueriesData({ queryKey: qk.history }, (old: unknown) =>
        patchOptimisticExpense(old, expenseId, patch)
      );

      return { previousExpenses, previousHistory };
    },

    onError: (_err, _variables, context) => {
      restoreSnapshots(qc, context?.previousExpenses);
      restoreSnapshots(qc, context?.previousHistory);
      toast.error("Could not save your changes. The expense has been restored.");
    },

    onSuccess: (response, { expenseId }) => {
      const server = response?.expense;
      if (server) {
        const confirmed = {
          title: server.title,
          description: server.description,
          memo: server.memo,
          receiptUrl: server.receiptUrl,
          pending: false,
        };
        qc.setQueriesData({ queryKey: qk.expenses(groupId) }, (old: unknown) =>
          patchOptimisticExpense(old, expenseId, confirmed)
        );
        qc.setQueriesData({ queryKey: qk.history }, (old: unknown) =>
          patchOptimisticExpense(old, expenseId, confirmed)
        );
      }
      toast.success("Expense updated");
    },

    onSettled: () => {
      invalidate([qk.expenses(groupId)]);
      qc.invalidateQueries({ queryKey: qk.activity(groupId) });
      qc.invalidateQueries({ queryKey: qk.history });
    },
  });
}
