"use client";

/**
 * Shared building blocks for optimistic expense creation (#488).
 *
 * Both mutation hooks that create an expense — `useCreateExpense` in
 * `queries.ts` and `useCreateExpenseMutation` in `hooks/useExpenseMutations.ts`
 * — compose these so the cache-write and the rollback can never drift apart.
 */

import type { QueryClient } from "@tanstack/react-query";
import type { CreateExpenseRequest, Expense, User } from "./types";

/** Snapshot of every expense query matched by a key prefix, for rollback. */
export type ExpenseQuerySnapshot = ReturnType<QueryClient["getQueriesData"]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Build the placeholder expense that stands in for the server response while
 * the request is in flight. Always flagged `isOptimistic`/`pending` so list
 * renderers can style it, and given a `opt-` prefixed id so a late-arriving
 * server payload never collides with it.
 */
export function buildOptimisticExpense(
  groupId: string,
  data: CreateExpenseRequest,
  payer?: User | null
): Expense {
  const optId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const payerUser: User = payer ?? {
    id: data.payerUserId || "",
    displayName: "You",
    avatarUrl: null,
    stellarPublicKey: "",
    createdAt: new Date().toISOString(),
  };

  return {
    id: optId,
    groupId,
    payerUserId: data.payerUserId || payerUser.id,
    payer: payerUser,
    title: data.title,
    description: data.description ?? null,
    amount: data.amount,
    assetCode: data.assetCode,
    assetIssuer: data.assetIssuer ?? null,
    splitType: data.splitType,
    memo: data.memo ?? null,
    receiptUrl: data.receiptUrl ?? null,
    createdAt: new Date().toISOString(),
    shares: (data.shares ?? []).map((s, idx) => ({
      id: `share-opt-${idx}`,
      expenseId: optId,
      userId: s.userId,
      user: {
        id: s.userId,
        displayName: "Member",
        avatarUrl: null,
        stellarPublicKey: "",
        createdAt: new Date().toISOString(),
      },
      shareAmount: s.amount ?? "0",
      status: "pending",
    })),
    isOptimistic: true,
    pending: true,
  };
}

/** Copy the current value of every query under `queryKeyPrefix`. */
export function snapshotExpenseQueries(
  qc: QueryClient,
  queryKeyPrefix: readonly unknown[]
): ExpenseQuerySnapshot {
  return qc.getQueriesData({ queryKey: queryKeyPrefix });
}

/** Put a snapshot back verbatim — the rollback half of the optimistic pair. */
export function restoreExpenseQueries(
  qc: QueryClient,
  snapshot: ExpenseQuerySnapshot
): void {
  for (const [key, data] of snapshot) {
    qc.setQueryData(key, data);
  }
}

/**
 * Prepend the optimistic expense to every cached expense list under
 * `queryKeyPrefix`, covering both the infinite (`{ pages: [...] }`) and the
 * plain (`{ expenses: [...] }`) response shapes. Queries with no data yet are
 * skipped — the next fetch seeds them with the server's list anyway.
 */
export function prependOptimisticExpense(
  qc: QueryClient,
  queryKeyPrefix: readonly unknown[],
  expense: Expense
): void {
  for (const [key, oldData] of qc.getQueriesData({ queryKey: queryKeyPrefix })) {
    if (!isRecord(oldData)) continue;

    if (Array.isArray(oldData.pages)) {
      const pages = oldData.pages as Array<Record<string, unknown>>;
      if (pages.length === 0) continue;
      const firstPage = pages[0];
      const existing = (firstPage.expenses as Expense[] | undefined) ?? [];
      qc.setQueryData(key, {
        ...oldData,
        pages: [{ ...firstPage, expenses: [expense, ...existing] }, ...pages.slice(1)],
      });
      continue;
    }

    if (Array.isArray(oldData.expenses)) {
      qc.setQueryData(key, {
        ...oldData,
        expenses: [expense, ...(oldData.expenses as Expense[])],
      });
    }
  }
}
