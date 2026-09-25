/**
 * Optimistic cache helpers (issue #375).
 *
 * Every function here is pure and DOM-free so it can be unit-tested without a
 * React tree: the mutation hooks in `src/hooks/useExpenseMutations.ts` and
 * `src/lib/queries.ts` own the React Query plumbing (cancel → snapshot →
 * apply → rollback) and delegate the actual data shaping to these helpers.
 *
 * Two shapes are supported for the expense list because the app caches both:
 *  - the plain `ExpensesResponse` (`{ expenses: [...] }`) used by `useExpenses`
 *  - the infinite-query page shape (`{ pages: [{ expenses: [...] }] }`) used by
 *    `useInfiniteExpenses`
 *
 * Anything else (a still-undefined cache, an unexpected payload) is returned
 * untouched rather than throwing — an optimistic write must never be the
 * reason a mutation fails.
 */

import type {
  BalancesResponse,
  CreateExpenseRequest,
  Expense,
  ExpenseShare,
  SplitType,
  User,
} from "./types";

/** Prefix that marks a cache entry as client-generated (never a server id). */
export const OPTIMISTIC_EXPENSE_PREFIX = "optimistic-expense-";

/** True for ids minted by {@link buildOptimisticExpense}. */
export function isOptimisticExpenseId(id: string): boolean {
  return typeof id === "string" && id.startsWith(OPTIMISTIC_EXPENSE_PREFIX);
}

/** Stable-ish client id: `crypto.randomUUID` when available, else a fallback. */
function newOptimisticId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  const unique =
    c && typeof c.randomUUID === "function"
      ? c.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${OPTIMISTIC_EXPENSE_PREFIX}${unique}`;
}

/**
 * Round a float to the 7 decimal places Stellar uses on the wire so the
 * optimistically rendered amount matches what the server eventually returns.
 */
function toDecimalString(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 1e7) / 1e7);
}

/**
 * The share a participant would owe for `request`, mirroring the split rules
 * the server applies (`calculateOptimisticBalances` uses the same maths).
 */
export function shareAmountForRequest(
  request: CreateExpenseRequest,
  index: number
): string {
  const input = request.shares?.[index];
  const total = parseFloat(request.amount) || 0;
  const count = request.shares?.length ?? 0;

  switch (request.splitType as SplitType) {
    case "custom":
      return toDecimalString(parseFloat(input?.amount || "0") || 0);
    case "percentage":
      return toDecimalString((total * (input?.percent || 0)) / 100);
    case "equal":
    default:
      return toDecimalString(count > 0 ? total / count : 0);
  }
}

/** Fallback profile for a member that is not in any loaded cache yet. */
function unknownMember(userId: string): User {
  return {
    id: userId,
    stellarPublicKey: "",
    displayName: "Member",
    avatarUrl: null,
    createdAt: new Date(0).toISOString(),
  };
}

export interface BuildOptimisticExpenseArgs {
  groupId: string;
  request: CreateExpenseRequest;
  /** The user paying — also the fallback `payerUserId`. */
  payer: User;
  /** Resolve a member profile for share display names, when known. */
  resolveUser?: (userId: string) => User | undefined;
  /** Injectable clock, keeps tests deterministic. */
  now?: Date;
}

/**
 * Build the `Expense` the list should render while `POST /expenses` is still
 * in flight: flagged `isOptimistic` (the card renders it dimmed with a
 * "Saving…" badge and disables destructive actions), with one pending share
 * per participant.
 */
export function buildOptimisticExpense(
  args: BuildOptimisticExpenseArgs
): Expense {
  const { groupId, request, payer, resolveUser, now } = args;
  const id = newOptimisticId();
  const shares: ExpenseShare[] = (request.shares ?? []).map((input, index) => ({
    id: `${id}-share-${index}`,
    expenseId: id,
    userId: input.userId,
    user: resolveUser?.(input.userId) ?? unknownMember(input.userId),
    shareAmount: shareAmountForRequest(request, index),
    status: "pending",
  }));

  return {
    id,
    groupId,
    payerUserId: request.payerUserId || payer.id,
    payer,
    title: request.title,
    description: request.description ?? null,
    amount: request.amount,
    assetCode: request.assetCode,
    assetIssuer: request.assetIssuer ?? null,
    splitType: request.splitType,
    memo: request.memo ?? null,
    receiptUrl: request.receiptUrl ?? null,
    createdAt: (now ?? new Date()).toISOString(),
    shares,
    isOptimistic: true,
  };
}

interface ExpenseListLike {
  expenses?: unknown;
}

interface ExpensePagesLike {
  pages?: unknown;
}

function isExpenseArray(value: unknown): value is Expense[] {
  return Array.isArray(value);
}

function prependUnique(list: Expense[], expense: Expense): Expense[] {
  return list.some((e) => e.id === expense.id) ? list : [expense, ...list];
}

/**
 * Insert `expense` at the top of whichever expense-list cache shape is
 * currently stored under `key`. Returns the input untouched when the shape is
 * unrecognised (or empty), so a cache miss never breaks the mutation.
 */
export function insertOptimisticExpense<T>(
  cache: T,
  expense: Expense
): T {
  if (cache === undefined || cache === null) return cache;

  if (Array.isArray(cache)) {
    return prependUnique(cache as unknown as Expense[], expense) as unknown as T;
  }

  const pages = (cache as ExpensePagesLike).pages;
  if (Array.isArray(pages)) {
    return {
      ...(cache as object),
      pages: pages.map((page, index) => {
        const list = (page as ExpenseListLike)?.expenses;
        if (index !== 0 || !isExpenseArray(list)) return page;
        return { ...(page as object), expenses: prependUnique(list, expense) };
      }),
    } as T;
  }

  const list = (cache as ExpenseListLike).expenses;
  if (isExpenseArray(list)) {
    return {
      ...(cache as object),
      expenses: prependUnique(list, expense),
    } as T;
  }

  return cache;
}

/**
 * Drop every cache entry carrying `expenseId` — used to undo an insert when
 * the mutation fails before the invalidation refetch lands.
 */
export function removeOptimisticExpense<T>(cache: T, expenseId: string): T {
  if (cache === undefined || cache === null) return cache;

  if (Array.isArray(cache)) {
    return (cache as unknown as Expense[]).filter(
      (e) => e.id !== expenseId
    ) as unknown as T;
  }

  const pages = (cache as ExpensePagesLike).pages;
  if (Array.isArray(pages)) {
    return {
      ...(cache as object),
      pages: pages.map((page) => {
        const list = (page as ExpenseListLike)?.expenses;
        if (!isExpenseArray(list)) return page;
        return {
          ...(page as object),
          expenses: list.filter((e) => e.id !== expenseId),
        };
      }),
    } as T;
  }

  const list = (cache as ExpenseListLike).expenses;
  if (isExpenseArray(list)) {
    return {
      ...(cache as object),
      expenses: list.filter((e) => e.id !== expenseId),
    } as T;
  }

  return cache;
}

export interface OptimisticTransfer {
  /** Who signs and pays. */
  fromUserId: string;
  /** Who receives the funds. */
  toUserId: string;
  /** Decimal string, e.g. `"12.5000000"`. */
  amount: string;
  /**
   * Restrict the adjustment to rows of this asset. Rows without an asset code
   * (older payloads) always match, so a partial payload degrades to "move the
   * money everywhere" rather than to a silently skipped update.
   */
  assetCode?: string;
}

/**
 * Move `amount` from the payer's balance to the payee's.
 *
 * `MemberBalance.net` is signed (`positive = is owed, negative = owes`), so a
 * payment the current user makes *raises* their own net by `amount` and
 * *lowers* the recipient's by the same amount — exactly what the server does
 * once the settlement confirms. Rows that are missing, malformed, or not part
 * of the transfer are left alone.
 */
export function applyOptimisticSettlement(
  balances: BalancesResponse,
  transfer: OptimisticTransfer
): BalancesResponse {
  if (!balances || !Array.isArray(balances.balances)) return balances;

  const amount = parseFloat(transfer.amount);
  if (!Number.isFinite(amount) || amount === 0) return balances;

  let changed = false;
  const next = balances.balances.map((row) => {
    const wrongAsset =
      Boolean(transfer.assetCode) &&
      Boolean(row.assetCode) &&
      row.assetCode !== transfer.assetCode;
    if (wrongAsset) return row;

    let delta = 0;
    if (row.userId === transfer.fromUserId) delta = amount;
    else if (row.userId === transfer.toUserId) delta = -amount;
    else return row;

    const current = parseFloat(row.net);
    if (!Number.isFinite(current)) return row;

    changed = true;
    return { ...row, net: toDecimalString(current + delta) };
  });

  if (!changed) return balances;
  return { ...balances, balances: next };
}
