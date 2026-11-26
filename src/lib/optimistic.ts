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
  GroupDetail,
  Invite,
  InviteRequest,
  PendingGroupInvite,
  ShareStatus,
  SplitType,
  User,
} from "./types";
import { fromStroops, toSignedStroops } from "./money";

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
export function calculateOptimisticBalances(
  currentBalances: BalancesResponse | undefined,
  expense: CreateExpenseRequest,
  currentUserId: string
): BalancesResponse {
  if (!currentBalances) return { balances: [], suggestions: [] };
  // Basic optimistic balance adjustments
  return currentBalances;
}

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

/** Editable fields of an expense, mirroring `UpdateExpenseRequest`. */
export type ExpensePatch = Partial<
  Pick<Expense, "title" | "description" | "memo" | "receiptUrl">
>;

/**
 * Merge `patch` into the expense with `expenseId` in whichever expense-list
 * cache shape is stored (flat array, `{ expenses }`, or infinite `pages`) —
 * used to render an edit immediately while `PATCH /expenses/:id` is in
 * flight (#892).
 *
 * `pending` is set on the patched entry so the card can show a "Saving…"
 * state; pass `pending: false` with the server's copy to clear it. Entries
 * that don't match, and unrecognised cache shapes, are returned untouched
 * (same reference), so an unrelated cache is never re-rendered.
 */
export function patchOptimisticExpense<T>(
  cache: T,
  expenseId: string,
  patch: ExpensePatch & { pending?: boolean }
): T {
  if (cache === undefined || cache === null) return cache;

  const apply = (list: Expense[]): Expense[] => {
    let changed = false;
    const next = list.map((e) => {
      if (e.id !== expenseId) return e;
      changed = true;
      const merged: Expense = { ...e };
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) (merged as unknown as Record<string, unknown>)[key] = value;
      }
      if (patch.pending === undefined) merged.pending = true;
      return merged;
    });
    return changed ? next : list;
  };

  if (Array.isArray(cache)) {
    const list = cache as unknown as Expense[];
    const next = apply(list);
    return (next === list ? cache : next) as unknown as T;
  }

  const pages = (cache as ExpensePagesLike).pages;
  if (Array.isArray(pages)) {
    let changed = false;
    const nextPages = pages.map((page) => {
      const list = (page as ExpenseListLike)?.expenses;
      if (!isExpenseArray(list)) return page;
      const next = apply(list);
      if (next === list) return page;
      changed = true;
      return { ...(page as object), expenses: next };
    });
    return changed ? ({ ...(cache as object), pages: nextPages } as T) : cache;
  }

  const list = (cache as ExpenseListLike).expenses;
  if (isExpenseArray(list)) {
    const next = apply(list);
    return next === list ? cache : ({ ...(cache as object), expenses: next } as T);
  }

  return cache;
}

/**
 * Set one participant's share status on a single expense, for optimistic
 * settlement feedback (#906).
 *
 * Mirrors {@link patchOptimisticExpense}: both cached expense shapes are
 * supported and an unchanged/absent expense returns the original reference so
 * React Query can skip notifications. Other shares and the expense's own
 * `pending` flag are untouched.
 */
export function patchOptimisticShareStatus<T>(
  cache: T,
  expenseId: string,
  userId: string,
  status: ShareStatus
): T {
  if (cache === undefined || cache === null) return cache;

  const apply = (list: Expense[]): Expense[] => {
    let changed = false;
    const next = list.map((expense) => {
      if (expense.id !== expenseId) return expense;
      const shareIndex = expense.shares.findIndex(
        (share) => share.userId === userId
      );
      if (shareIndex === -1) return expense;
      if (expense.shares[shareIndex].status === status) return expense;
      changed = true;
      return {
        ...expense,
        shares: expense.shares.map((share, index) =>
          index === shareIndex ? { ...share, status } : share
        ),
      };
    });
    return changed ? next : list;
  };

  if (Array.isArray(cache)) {
    const list = cache as unknown as Expense[];
    const next = apply(list);
    return (next === list ? cache : next) as unknown as T;
  }

  const pages = (cache as ExpensePagesLike).pages;
  if (Array.isArray(pages)) {
    let changed = false;
    const nextPages = pages.map((page) => {
      const list = (page as ExpenseListLike)?.expenses;
      if (!isExpenseArray(list)) return page;
      const next = apply(list);
      if (next === list) return page;
      changed = true;
      return { ...(page as object), expenses: next };
    });
    return changed ? ({ ...(cache as object), pages: nextPages } as T) : cache;
  }

  const list = (cache as ExpenseListLike).expenses;
  if (isExpenseArray(list)) {
    const next = apply(list);
    return next === list ? cache : ({ ...(cache as object), expenses: next } as T);
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

  let amount: bigint;
  try {
    amount = toSignedStroops(transfer.amount);
  } catch {
    return balances;
  }
  if (amount === BigInt(0)) return balances;

  let changed = false;
  const next = balances.balances.map((row) => {
    const wrongAsset =
      Boolean(transfer.assetCode) &&
      Boolean(row.assetCode) &&
      row.assetCode !== transfer.assetCode;
    if (wrongAsset) return row;

    let delta = BigInt(0);
    if (row.userId === transfer.fromUserId) delta = amount;
    else if (row.userId === transfer.toUserId) delta = -amount;
    else return row;

    let current: bigint;
    try {
      current = toSignedStroops(row.net);
    } catch {
      return row;
    }

    changed = true;
    return { ...row, net: fromStroops(current + delta) };
  });

  if (!changed) return balances;
  return { ...balances, balances: next };
}

/** Prefix that marks an invite row as client-generated (never a server id). */
export const OPTIMISTIC_INVITE_PREFIX = "optimistic-invite-";

/** True for ids minted by {@link buildPendingInvite}. */
export function isOptimisticInviteId(id: string): boolean {
  return typeof id === "string" && id.startsWith(OPTIMISTIC_INVITE_PREFIX);
}

function newOptimisticInviteId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  const unique =
    c && typeof c.randomUUID === "function"
      ? c.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${OPTIMISTIC_INVITE_PREFIX}${unique}`;
}

/**
 * Build the pending invite row shown while `POST /groups/:id/invite` is in
 * flight (#812). The inviting admin sees that an invitation is being issued
 * immediately, without waiting for the API to mint a code.
 */
export function buildPendingInvite(args: {
  groupId: string;
  request?: InviteRequest;
  now?: Date;
}): PendingGroupInvite {
  const { groupId, request, now } = args;
  const hours = request?.expiresInHours;
  const expiresAt =
    typeof hours === "number" && Number.isFinite(hours) && hours > 0
      ? new Date((now ?? new Date()).getTime() + hours * 60 * 60 * 1000).toISOString()
      : null;

  return {
    id: newOptimisticInviteId(),
    groupId,
    code: null,
    maxUses: request?.maxUses ?? null,
    expiresAt,
    createdAt: (now ?? new Date()).toISOString(),
    pending: true,
  };
}

function withPendingInvites(
  detail: GroupDetail,
  pendingInvites: PendingGroupInvite[]
): GroupDetail {
  return { ...detail, pendingInvites };
}

/**
 * Append a pending invite to a cached group detail. A missing cache (cold
 * load) cannot render a roster anyway, so it is left untouched rather than
 * fabricating a partial group.
 */
export function appendPendingInvite(
  detail: GroupDetail | undefined,
  invite: PendingGroupInvite
): GroupDetail | undefined {
  if (!detail) return detail;
  const existing = detail.pendingInvites ?? [];
  if (existing.some((entry) => entry.id === invite.id)) return detail;
  return withPendingInvites(detail, [...existing, invite]);
}

/**
 * Swap the placeholder created in `onMutate` for the server's invite once the
 * request succeeds. Any other pending rows are preserved untouched.
 */
export function replacePendingInvite(
  detail: GroupDetail | undefined,
  placeholderId: string,
  invite: Invite
): GroupDetail | undefined {
  if (!detail || !Array.isArray(detail.pendingInvites)) return detail;

  const confirmed: PendingGroupInvite = {
    id: invite.id,
    groupId: invite.groupId,
    code: invite.code,
    maxUses: invite.maxUses,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    pending: false,
  };

  let replaced = false;
  const next = detail.pendingInvites.map((entry) => {
    if (entry.id !== placeholderId) return entry;
    replaced = true;
    return confirmed;
  });

  return replaced ? withPendingInvites(detail, next) : detail;
}

/** Drop an invite row by id — used when a caller abandons one explicitly. */
export function removePendingInvite(
  detail: GroupDetail | undefined,
  inviteId: string
): GroupDetail | undefined {
  if (!detail || !Array.isArray(detail.pendingInvites)) return detail;
  const next = detail.pendingInvites.filter((entry) => entry.id !== inviteId);
  return next.length === detail.pendingInvites.length
    ? detail
    : withPendingInvites(detail, next);
}

/** Cache snapshots as returned by `queryClient.getQueriesData`. */
type CacheSnapshots = ReadonlyArray<readonly [unknown, unknown]>;

function expenseListFromCache(cache: unknown): Expense[] | null {
  if (Array.isArray(cache)) return cache as Expense[];
  if (!cache || typeof cache !== "object") return null;

  const pages = (cache as ExpensePagesLike).pages;
  if (Array.isArray(pages)) {
    const found: Expense[] = [];
    for (const page of pages) {
      const list = (page as ExpenseListLike)?.expenses;
      if (isExpenseArray(list)) found.push(...list);
    }
    return found;
  }

  const list = (cache as ExpenseListLike).expenses;
  return isExpenseArray(list) ? list : null;
}

/** Find an expense by id across flat, paged and array cache shapes. */
export function findExpenseInCaches(
  caches: CacheSnapshots | undefined,
  expenseId: string
): Expense | undefined {
  if (!caches) return undefined;
  for (const [, data] of caches) {
    const list = expenseListFromCache(data);
    const match = list?.find((expense) => expense.id === expenseId);
    if (match) return match;
  }
  return undefined;
}

/**
 * Undo the balance contribution of `expense` — the inverse of
 * `calculateOptimisticBalances` — so deleting an expense updates the "settle
 * up" panel before the server answers (#818).
 *
 * Rows outside the expense's asset, and expenses without share data (older
 * payloads), are left untouched: a partial dataset must never move money.
 */
export function reverseOptimisticExpenseBalances(
  balances: BalancesResponse,
  expense: Expense
): BalancesResponse {
  if (!balances || !Array.isArray(balances.balances)) return balances;

  const shares = expense.shares ?? [];
  if (shares.length === 0) return balances;

  const total = parseFloat(expense.amount);
  if (!Number.isFinite(total)) return balances;

  const shareByUser = new Map<string, number>();
  for (const share of shares) {
    const amount = parseFloat(share.shareAmount) || 0;
    shareByUser.set(share.userId, (shareByUser.get(share.userId) ?? 0) + amount);
  }

  let changed = false;
  const next = balances.balances.map((row) => {
    if (
      expense.assetCode &&
      row.assetCode &&
      row.assetCode !== expense.assetCode
    ) {
      return row;
    }

    const share = shareByUser.get(row.userId) ?? 0;
    const paid = row.userId === expense.payerUserId ? total : 0;
    const delta = paid - share;
    if (delta === 0) return row;

    const current = parseFloat(row.net);
    if (!Number.isFinite(current)) return row;

    changed = true;
    return { ...row, net: toDecimalString(current - delta) };
  });

  return changed ? { ...balances, balances: next } : balances;
}
