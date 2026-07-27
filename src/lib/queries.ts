"use client";

import { useEffect, useRef } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "./api";
import { useAuth } from "./auth-store";
import type {
  BalancesResponse,
  ConfirmSettlementRequest,
  CreateExpenseRequest,
  CreateGroupRequest,
  CreateSettlementRequest,
  EnableTreasuryRequest,
  InviteRequest,
  SettleExpenseRequest,
  TreasuryDepositRequest,
  TreasuryWithdrawRequest,
  UpdateMeRequest,
} from "./types";
import type { ExpensesPage } from "./expenses";

export const qk = {
  me: ["me"] as const,
  groups: ["groups"] as const,
  group: (id: string) => ["groups", id] as const,
  expenses: (groupId: string) => ["groups", groupId, "expenses"] as const,
  balances: (groupId: string) => ["groups", groupId, "balances"] as const,
  ledger: (groupId: string) => ["groups", groupId, "ledger"] as const,
  settlement: (id: string) => ["settlement", id] as const,
  treasury: (groupId: string) => ["groups", groupId, "treasury"] as const,
  treasuryHistory: (groupId: string) =>
    ["groups", groupId, "treasury", "history"] as const,
  anchors: ["anchors"] as const,
  anchorSessions: ["anchors", "sessions"] as const,
  history: ["history"] as const,
};

/** Polling parameters for settlement status while pending/submitted. */
export const SETTLEMENT_POLL_INTERVAL_MS = 3_000;
/**
 * Consecutive failed polls tolerated before giving up. After this many
 * failed cycles (with `retry: false` per cycle), the polling hook returns
 * `false` from `refetchInterval` so the dialog handles the failure rather
 * than spinning the API indefinitely. Prevents infinite polling loops on
 * dead upstream endpoints.
 */
export const SETTLEMENT_POLL_MAX_PERSISTENT_FAILURES = 3;

/**
 * Returns the next poll delay (in ms) for a settlement-status query, or
 * `false` to stop polling once the response reached a terminal state.
 * Exported separately so the stop behavior is unit-testable.
 *
 * The function short-circuits to `false` in three situations:
 *  - the latest response status is terminal (`confirmed` / `failed`),
 *  - no data has ever loaded and failures have piled up, or
 *  - the calling site passes nothing (defensive default).
 */
export function settlementPollInterval(query: {
  state: {
    data?: { status?: string };
  };
  failureCount?: number;
}): number | false {
  const status = query.state.data?.status;
  if (status === "confirmed" || status === "failed") return false;

  // Bound load on a broken upstream. With `retry: false`, each failed
  // refetch increments `failureCount` by 1; stopping after the cap keeps
  // the dialog from hammering the endpoint forever.
  const failures = query.failureCount ?? 0;
  if (failures >= SETTLEMENT_POLL_MAX_PERSISTENT_FAILURES) return false;

  return SETTLEMENT_POLL_INTERVAL_MS;
}

/** Pure guard for the expense form: block re-entry while submitting. */
export function shouldBlockExpenseSubmit(args: {
  isPending: boolean;
  submitting: boolean;
}): boolean {
  return args.isPending || args.submitting;
}

export function useMe() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: qk.me,
    queryFn: api.me,
    enabled: Boolean(token),
    staleTime: 60_000,
  });
}

export function useGroups() {
  return useQuery({ queryKey: qk.groups, queryFn: api.listGroups });
}

export function useGroup(id: string) {
  return useQuery({ queryKey: qk.group(id), queryFn: () => api.getGroup(id) });
}

export function useExpenses(groupId: string) {
  return useQuery({
    queryKey: qk.expenses(groupId),
    queryFn: () => api.listExpenses(groupId),
    staleTime: 30_000,
  });
}

/**
 * Cursor-paginated expense list backed by GET /api/expenses.
 *
 * Use this for groups with many expenses — pulling the full list in
 * one request is slow and burns memory. The first call uses
 * `options.limit` (default 20, max 100); each subsequent page uses
 * the `nextCursor` returned by the server.
 */
export function useInfiniteExpenses(
  groupId: string,
  options: { limit?: number; cursor?: string } = {}
) {
  return useInfiniteQuery({
    queryKey: [
      ...qk.expenses(groupId),
      "page",
      options.limit ?? 20,
      options.cursor ?? null,
    ],
    queryFn: ({ pageParam }) =>
      api.listExpensesPage(groupId, {
        limit: options.limit,
        cursor: pageParam as string | undefined,
      }),
    // Forward any caller-provided starting cursor through React
    // Query's page machinery so the first request carries it.
    initialPageParam: options.cursor as string | undefined,
    getNextPageParam: (lastPage: ExpensesPage) =>
      lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useBalances(groupId: string) {
  return useQuery({
    queryKey: qk.balances(groupId),
    queryFn: () => api.getBalances(groupId),
  });
}

export function useLedger(groupId: string) {
  return useQuery({
    queryKey: qk.ledger(groupId),
    queryFn: () => api.getLedger(groupId),
  });
}

export function useTreasuryInfo(groupId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.treasury(groupId),
    queryFn: () => api.treasuryInfo(groupId),
    enabled,
  });
}

export function useTreasuryHistory(groupId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.treasuryHistory(groupId),
    queryFn: () => api.treasuryHistory(groupId),
    enabled,
  });
}

export function useAnchors() {
  return useQuery({ queryKey: qk.anchors, queryFn: api.listAnchors });
}

export function useAnchorSessions() {
  return useQuery({
    queryKey: qk.anchorSessions,
    queryFn: api.anchorSessions,
    refetchInterval: 15_000,
  });
}

export function useHistory() {
  return useQuery({ queryKey: qk.history, queryFn: api.history });
}

/**
 * Poll a single settlement's status until it reaches a terminal state
 * (confirmed or failed). Bounded interval, capped failures, automatic
 * unmount cleanup via React Query.
 *
 * Consumers should pass `enabled` so polling only runs while the dialog
 * is open and the settlement is non-terminal.
 *
 * React Query v5's `Query` type doesn't expose a stable `failureCount`
 * property, so we track consecutive poll failures locally in a ref and
 * pass the value into the (unit-testable) `settlementPollInterval` helper.
 */
export function useSettlementStatus(settlementId: string | null, enabled = true) {
  const failureCount = useRef(0);

  const query = useQuery({
    queryKey: settlementId ? qk.settlement(settlementId) : ["settlement", "_"],
    queryFn: () =>
      api.getSettlement(settlementId as string).then((r) => r.settlement),
    enabled: Boolean(settlementId) && enabled,
    refetchInterval: (q) =>
      settlementPollInterval({
        state: { data: q.state.data as { status?: string } | undefined },
        failureCount: failureCount.current,
      }),
    refetchIntervalInBackground: false,
    // Cadence is handled by the polling interval — retrying on transient
    // failures compounds with the interval and amplifies load. Validation
    // errors (status 200, code "invalid_response") don't bypass the
    // provider retry gate, so we explicitly disable retries here and let
    // the next tick drive recovery.
    retry: false,
    staleTime: 0,
  });

  // Track consecutive failed poll cycles so the polling callback can
  // eventually return `false` once the cap is exceeded. `errorUpdatedAt`
  // / `dataUpdatedAt` change whenever the underlying query state moves
  // between error / success, so they're the right signal sources.
  useEffect(() => {
    if (query.isError) {
      failureCount.current += 1;
    } else if (query.isSuccess) {
      failureCount.current = 0;
    }
  }, [query.isError, query.isSuccess, query.errorUpdatedAt, query.dataUpdatedAt]);

  return query;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function useInvalidator() {
  const qc = useQueryClient();
  return (keys: readonly (readonly unknown[])[]) =>
    Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useCreateGroup() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (data: CreateGroupRequest) => api.createGroup(data),
    onSuccess: () => invalidate([qk.groups]),
  });
}

export function useJoinGroup() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (code: string) => api.joinGroup(code),
    onSuccess: () => invalidate([qk.groups]),
  });
}

export function useLeaveGroup(groupId: string) {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: () => api.leaveGroup(groupId),
    onSuccess: () => invalidate([qk.groups]),
  });
}

export function useArchiveGroup(groupId: string) {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: () => api.archiveGroup(groupId),
    onSuccess: () => invalidate([qk.groups, qk.group(groupId)]),
  });
}

export function useCreateInvite(groupId: string) {
  return useMutation({
    mutationFn: (data: InviteRequest) => api.createInvite(groupId, data),
  });
}

/**
 * Calculate optimistic group member balances based on an expense split.
 */
export function calculateOptimisticBalances(
  oldBalances: BalancesResponse,
  data: CreateExpenseRequest,
  payerUserId: string
): BalancesResponse {
  const totalAmount = parseFloat(data.amount) || 0;
  const sharesMap = new Map<string, number>();
  const shares = data.shares || [];

  if (data.splitType === "equal" && shares.length > 0) {
    const equalShare = totalAmount / shares.length;
    for (const s of shares) {
      sharesMap.set(s.userId, equalShare);
    }
  } else if (data.splitType === "custom") {
    for (const s of shares) {
      sharesMap.set(s.userId, parseFloat(s.amount || "0") || 0);
    }
  } else if (data.splitType === "percentage") {
    for (const s of shares) {
      sharesMap.set(s.userId, (totalAmount * (s.percent || 0)) / 100);
    }
  }

  const updatedBalances = oldBalances.balances.map((b) => {
    const participantShare = sharesMap.get(b.userId) ?? 0;
    const paidAmount = b.userId === payerUserId ? totalAmount : 0;
    const netDelta = paidAmount - participantShare;
    const currentNet = parseFloat(b.net) || 0;
    const newNet = currentNet + netDelta;

    return {
      ...b,
      net: String(Math.round(newNet * 10000000) / 10000000),
    };
  });

  return {
    ...oldBalances,
    balances: updatedBalances,
  };
}

export function useCreateExpense(groupId: string) {
  const invalidate = useInvalidator();
  const qc = useQueryClient();
  const me = useMe();

  return useMutation({
    mutationFn: (data: CreateExpenseRequest) => api.createExpense(groupId, data),
    // Optimistically update group member balances before the API responds
    onMutate: async (data: CreateExpenseRequest) => {
      const balanceKey = qk.balances(groupId);

      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await qc.cancelQueries({ queryKey: balanceKey });

      // Save a snapshot of current query data for rollback on error
      const previousBalances = qc.getQueryData<BalancesResponse>(balanceKey);

      // Apply optimistic update only if previous balance cache exists
      if (previousBalances) {
        const payerUserId =
          data.payerUserId ||
          me.data?.user.id ||
          useAuth.getState().user?.id ||
          "";

        qc.setQueryData<BalancesResponse>(balanceKey, (old) => {
          if (!old) return old;
          return calculateOptimisticBalances(old, data, payerUserId);
        });
      }

      return { previousBalances };
    },
    // On failure, revert back to saved snapshot and display error toast
    onError: (err, _variables, context) => {
      if (context?.previousBalances) {
        qc.setQueryData(qk.balances(groupId), context.previousBalances);
      }
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to create expense. Balances reverted."
      );
    },
    // Refetch canonical data on settlement (success or error)
    onSettled: () => {
      invalidate([
        qk.expenses(groupId),
        qk.balances(groupId),
        qk.ledger(groupId),
        qk.groups,
      ]);
    },
  });
}

export function useDeleteExpense(groupId: string) {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (expenseId: string) => api.deleteExpense(expenseId),
    onSuccess: () =>
      invalidate([
        qk.expenses(groupId),
        qk.balances(groupId),
        qk.ledger(groupId),
        qk.groups,
      ]),
  });
}

export function useSettleExpense() {
  return useMutation({
    mutationFn: ({
      expenseId,
      data,
    }: {
      expenseId: string;
      data?: SettleExpenseRequest;
    }) => api.settleExpense(expenseId, data),
  });
}

export function useCreateSettlement(groupId: string) {
  return useMutation({
    mutationFn: (data: CreateSettlementRequest) =>
      api.createSettlement(groupId, data),
  });
}

export function useConfirmSettlement(groupId: string) {
  const invalidate = useInvalidator();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      settlementId,
      data,
    }: {
      settlementId: string;
      data: ConfirmSettlementRequest;
    }) => api.confirmSettlement(settlementId, data),
    onSuccess: (_data, vars) => {
      // Seed the polled cache so the dialog reflects "submitted" without
      // forcing an immediate refetch before its first interval tick.
      qc.setQueryData(qk.settlement(vars.settlementId), _data.settlement);
      invalidate([
        qk.expenses(groupId),
        qk.balances(groupId),
        qk.ledger(groupId),
        qk.groups,
        qk.history,
      ]);
    },
  });
}

export function useEnableTreasury(groupId: string) {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (data: EnableTreasuryRequest) =>
      api.enableTreasury(groupId, data),
    onSuccess: () => invalidate([qk.group(groupId), qk.groups]),
  });
}

export function useTreasuryDeposit(groupId: string) {
  return useMutation({
    mutationFn: (data: TreasuryDepositRequest) =>
      api.treasuryDeposit(groupId, data),
  });
}

export function useTreasuryWithdraw(groupId: string) {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (data: TreasuryWithdrawRequest) =>
      api.treasuryWithdraw(groupId, data),
    onSuccess: () =>
      invalidate([qk.treasury(groupId), qk.treasuryHistory(groupId)]),
  });
}

export function useUpdateMe() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (data: UpdateMeRequest) => api.updateMe(data),
    onSuccess: () => invalidate([qk.me]),
  });
}
