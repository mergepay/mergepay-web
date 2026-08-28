"use client";

import { useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./api";
import { handleApiError } from "./errorHandler";
import { useAuth } from "./auth-store";
import type {
  BalancesResponse,
  BulkSettleRequest,
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
import { shouldResetQueryCache } from "./queryState";
import { mergeHistoryPages, type AccumulatedHistory } from "./expenses";
import type { Expense, LedgerEntry, Settlement } from "./types";
import type { HistoryResponse, LedgerResponse } from "./types";

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
    // Profile data barely changes and is refreshed by `useUpdateMe`
    // invalidation, so it can stay fresh longer than list data.
    staleTime: 60_000,
  });
}

/**
 * Session-scoped queries.
 *
 * Group data is only ever fetched while a session exists. Without this gate a
 * logged-out render still issues the request and briefly parks another
 * wallet's groups in the cache.
 */
function useSessionEnabled() {
  return Boolean(useAuth((s) => s.token));
}

export function useGroups() {
  return useQuery({
    queryKey: qk.groups,
    queryFn: api.listGroups,
    enabled: useSessionEnabled(),
  });
}

export function useGroup(id: string) {
  return useQuery({
    queryKey: qk.group(id),
    queryFn: () => api.getGroup(id),
    enabled: useSessionEnabled() && Boolean(id),
  });
}

export function useExpenses(groupId: string) {
  // Uses the global default staleTime (30s, see src/lib/queryClient.ts):
  // list data is shown from cache instantly and revalidated in the
  // background (stale-while-revalidate), while expense mutations still
  // force a refetch through `invalidateQueries`.
  return useQuery({
    queryKey: qk.expenses(groupId),
    queryFn: () => api.listExpenses(groupId),
    staleTime: 30_000,
    enabled: useSessionEnabled() && Boolean(groupId),
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
    // The group id is the first segment of the key, so switching groups
    // reads a different cache entry rather than appending pages onto the
    // previous group's list. Signing out calls `queryClient.clear()`
    // (see `useAuth`), which drops these entries entirely.
    queryKey: [
      ...qk.expenses(groupId),
      "page",
      options.limit ?? 20,
      options.cursor ?? null,
    ],
    enabled: Boolean(groupId),
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
    // Global default staleTime (30s) — see useExpenses above.
  });
}

export function useBalances(groupId: string) {
  return useQuery({
    queryKey: qk.balances(groupId),
    queryFn: () => api.getBalances(groupId),
    // Balances must never be served stale: they back the "settle up"
    // amounts a user signs on-chain. Always revalidate on mount/focus
    // (in addition to the invalidation that follows every settlement).
    staleTime: 0,
    enabled: useSessionEnabled() && Boolean(groupId),
  });
}

export function useLedger(groupId: string) {
  return useQuery({
    queryKey: qk.ledger(groupId),
    queryFn: () => api.getLedger(groupId),
  });
}

/**
 * Cursor-paginated ledger backed by GET /groups/:id/ledger.
 *
 * Use this for groups with many entries — loading the full dataset
 * at once is slow and burns memory. The first call uses
 * `options.limit` (default 20); each subsequent page uses the
 * `nextCursor` returned by the server.
 */
export function useInfiniteLedger(
  groupId: string,
  options: { limit?: number } = {}
) {
  return useInfiniteQuery({
    queryKey: [...qk.ledger(groupId), "page", options.limit ?? 20],
    queryFn: ({ pageParam }) =>
      api.getLedger(groupId, {
        limit: options.limit,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
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

export function useInfiniteHistory(options: { limit?: number } = {}) {
  return useInfiniteQuery({
    queryKey: [...qk.history, "page", options.limit ?? 20],
    queryFn: ({ pageParam }) =>
      api.history({
        limit: options.limit,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

/**
 * Pure utility: merge all loaded history pages into a single accumulated
 * view, deduplicating by id across pages.
 */
export function accumulateHistoryPages(
  pages: HistoryResponse[] | undefined
): AccumulatedHistory {
  if (!pages) return { expenses: [], settlements: [] };
  return pages.reduce(
    (acc, page) =>
      mergeHistoryPages(acc, {
        expenses: page.expenses,
        settlements: page.settlements,
      }),
    { expenses: [] as Expense[], settlements: [] as Settlement[] }
  );
}

/**
 * Pure utility: merge all loaded ledger pages into a single accumulated
 * array, deduplicating by entry position.
 */
export function accumulateLedgerPages(
  pages: LedgerResponse[] | undefined
): LedgerEntry[] {
  if (!pages) return [];
  const seen = new Set<string>();
  return pages.flatMap((page) =>
    page.entries.filter((entry) => {
      // Use the embedded id for stable deduplication across pages.
      const id =
        entry.type === "expense"
          ? entry.expense.id
          : entry.type === "settlement"
            ? entry.settlement.id
            : entry.treasuryTransaction.id;
      const key = `${entry.type}-${id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  );
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
  const [pollingStalled, setPollingStalled] = useState(false);

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
  //
  // Once the cap is hit, `refetchInterval` freezes at `false` and no more
  // ticks fire — nothing else would ever flip `pollingStalled` back off,
  // so callers need this flag to offer a manual "check status" retry
  // instead of leaving the UI spinning on a dead poll forever.
  useEffect(() => {
    if (query.isError) {
      failureCount.current += 1;
      if (failureCount.current >= SETTLEMENT_POLL_MAX_PERSISTENT_FAILURES) {
        setPollingStalled(true);
      }
    } else if (query.isSuccess) {
      failureCount.current = 0;
      setPollingStalled(false);
    }
  }, [query.isError, query.isSuccess, query.errorUpdatedAt, query.dataUpdatedAt]);

  return { ...query, pollingStalled };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * A query key to invalidate. React Query matches keys by prefix, so
 * `exact` is available for keys that are a prefix of unrelated keys —
 * `qk.groups` (`["groups"]`) otherwise sweeps every group-scoped query.
 */
export type InvalidationTarget =
  | readonly unknown[]
  | { queryKey: readonly unknown[]; exact?: boolean };

/** Normalise an `InvalidationTarget` into React Query filters. */
export function invalidationFilters(target: InvalidationTarget): {
  queryKey: readonly unknown[];
  exact?: boolean;
} {
  return "queryKey" in target ? target : { queryKey: target };
}

function useInvalidator() {
  const qc = useQueryClient();
  return (targets: readonly InvalidationTarget[]) =>
    Promise.all(targets.map((t) => qc.invalidateQueries(invalidationFilters(t))));
}

/**
 * The queries whose data an expense mutation can change: the group's
 * expense list (including its paginated variants, matched by prefix), the
 * group's balances and ledger, and the group list whose `yourNet` totals
 * are derived from them.
 *
 * The group list is invalidated exactly: `["groups"]` is a prefix of every
 * per-group key, so a non-exact match would refetch unrelated groups.
 */
export function expenseCacheKeys(groupId: string): InvalidationTarget[] {
  return [
    qk.expenses(groupId),
    qk.balances(groupId),
    qk.ledger(groupId),
    { queryKey: qk.groups, exact: true },
  ];
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
      handleApiError(err, "Failed to create expense. Balances reverted.");
    },
    // Refetch canonical data on settlement (success or error) so the list,
    // balances and ledger reflect the server's view — an optimistic entry
    // is never left alongside the persisted one.
    onSettled: () => {
      invalidate(expenseCacheKeys(groupId));
    },
  });
}

export function useDeleteExpense(groupId: string) {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (expenseId: string) => api.deleteExpense(expenseId),
    onSuccess: () => invalidate(expenseCacheKeys(groupId)),
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

export function useBulkSettle(groupId: string) {
  // Cache invalidation for bulk settlements happens inside the dialog via
  // useConfirmSettlement — don't duplicate invalidations here or you'll risk
  // double-refetching on success.
  return useMutation({
    mutationFn: (data: BulkSettleRequest) =>
      api.bulkSettleExpenses(groupId, data),
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

/**
 * Drop every cached response when the signed-in wallet changes.
 *
 * `invalidateQueries` would keep the previous wallet's groups on screen while
 * the refetch runs; removing them means a new session can never render the old
 * one's data, even for a frame.
 */
export function useWalletScopedCache() {
  const qc = useQueryClient();
  const publicKey = useAuth((s) => s.user?.stellarPublicKey ?? null);
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (shouldResetQueryCache(previous.current, publicKey)) {
      qc.removeQueries();
    }
    previous.current = publicKey;
  }, [publicKey, qc]);
}

export function useUpdateMe() {
  const invalidate = useInvalidator();
  return useMutation({
    mutationFn: (data: UpdateMeRequest) => api.updateMe(data),
    onSuccess: () => invalidate([qk.me]),
  });
}
