import type { z } from "zod";
import { API_URL } from "./constants";
import { getToken, useAuth } from "./auth-store";
import {
  BalancesResponseSchema,
  ExpensesResponseSchema,
  GroupsResponseSchema,
  GroupDetailSchema,
  HistoryResponseSchema,
  LedgerResponseSchema,
  SettlementIntentResponseSchema,
  SettlementResponseSchema,
  MeResponseSchema,
  ExpenseResponseSchema,
} from "./schemas";
import type {
  AnchorCompleteRequest,
  AnchorDepositRequest,
  AnchorSessionResponse,
  AnchorSessionsResponse,
  AnchorsResponse,
  AnchorStartResponse,
  AnchorWithdrawRequest,
  BalancesResponse,
  ChallengeResponse,
  ConfirmSettlementRequest,
  CreateExpenseRequest,
  CreateGroupRequest,
  CreateSettlementRequest,
  EnableTreasuryRequest,
  ExpenseResponse,
  ExpensesResponse,
  GroupDetail,
  GroupResponse,
  GroupsResponse,
  HistoryResponse,
  InviteRequest,
  InviteResponse,
  JoinGroupResponse,
  LedgerResponse,
  MeResponse,
  SettlementIntentResponse,
  SettlementResponse,
  SettleExpenseRequest,
  TreasuryDepositRequest,
  TreasuryHistoryResponse,
  TreasuryInfoResponse,
  TreasuryIntentResponse,
  TreasuryTransactionResponse,
  TreasuryWithdrawRequest,
  UpdateExpenseRequest,
  UpdateMeRequest,
  UploadResponse,
  VerifyResponse,
} from "./types";
import type { ExpensesPage } from "./expenses";

export class ApiRequestError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

let expiryHandled = false;

export function isSessionExpired(): boolean {
  return expiryHandled;
}

export function resetSessionExpired(): void {
  expiryHandled = false;
}

/**
 * Parse an upstream error response into a `(code, message)` pair.
 *
 * Supports both the new canonical flat shape `{ error: string, code?:
 * string, details?: unknown }` and the legacy nested shape `{ error:
 * { code, message } }` so we stay compatible during the upstream
 * migration.
 *
 * Returns reasonable defaults when the body is missing, malformed,
 * or non-JSON — never throws.
 */
async function parseErrorBody(
  res: Response
): Promise<{ code: string; message: string }> {
  let code = "unknown";
  let message = `Request failed (${res.status})`;
  try {
    const data = (await res.json()) as
      | {
          error?: string | { code?: unknown; message?: unknown };
          code?: unknown;
        }
      | undefined;
    if (data) {
      if (typeof data.error === "string") {
        message = data.error;
        if (typeof data.code === "string") code = data.code;
      } else if (data.error && typeof data.error === "object") {
        const inner = data.error;
        if (typeof inner.code === "string") code = inner.code;
        if (typeof inner.message === "string") message = inner.message;
      }
    }
  } catch {
    // non-JSON error body — keep defaults
  }
  return { code, message };
}

async function request<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body = options.body;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers, body });

  if (res.status === 401 && token && !expiryHandled) {
    expiryHandled = true;
    useAuth.getState().clear();
  }

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new ApiRequestError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;

  const parsed: unknown = await res.json();

  if (options.schema) {
    const result = options.schema.safeParse(parsed);
    if (!result.success) {
      // Don't log the raw payload — it may carry billing/account data.
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[mergepay] response failed schema validation: ${path}`);
      }
      throw new ApiValidationError();
    }
    return result.data as T;
  }

  return parsed as T;
}

export const api = {
  // -- auth -----------------------------------------------------------------
  authChallenge: (account: string) =>
    request<ChallengeResponse>("/auth/challenge", {
      method: "POST",
      json: { account },
    }),
  authVerify: (transaction: string) =>
    request<VerifyResponse>("/auth/verify", {
      method: "POST",
      json: { transaction },
    }),
  authLogout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: () =>
    request<MeResponse>("/me", {
      schema: MeResponseSchema as unknown as z.ZodType<MeResponse>,
    }),
  updateMe: (data: UpdateMeRequest) =>
    request<MeResponse>("/me", { method: "PATCH", json: data }),

  // -- groups ---------------------------------------------------------------
  createGroup: (data: CreateGroupRequest) =>
    request<GroupResponse>("/groups", { method: "POST", json: data }),
  listGroups: () =>
    request<GroupsResponse>("/groups", {
      schema: GroupsResponseSchema as unknown as z.ZodType<GroupsResponse>,
    }),
  getGroup: (id: string) =>
    request<GroupDetail>(`/groups/${id}`, {
      schema: GroupDetailSchema as unknown as z.ZodType<GroupDetail>,
    }),
  createInvite: (groupId: string, data: InviteRequest = {}) =>
    request<InviteResponse>(`/groups/${groupId}/invite`, {
      method: "POST",
      json: data,
    }),
  joinGroup: (code: string) =>
    request<JoinGroupResponse>("/groups/join", { method: "POST", json: { code } }),
  leaveGroup: (groupId: string) =>
    request<{ ok: boolean }>(`/groups/${groupId}/leave`, { method: "POST" }),
  archiveGroup: (groupId: string) =>
    request<GroupResponse>(`/groups/${groupId}/archive`, { method: "POST" }),

  // -- expenses ---------------------------------------------------------------
  createExpense: (groupId: string, data: CreateExpenseRequest) =>
    request<ExpenseResponse>(`/groups/${groupId}/expenses`, {
      method: "POST",
      json: data,
    }),
  listExpenses: (groupId: string) =>
    request<ExpensesResponse>(`/groups/${groupId}/expenses`),
  /**
   * Cursor-paginated variant. Goes through the local web route at
   * /api/expenses so limit & cursor are validated server-side and so
   * any future route-level enforcement (rate limits, caching) reaches
   * the client transparently.
   *
   * Response shape is `{ data: Expense[], nextCursor: string | null }`,
   * matching the canonical pagination format specified in issue #23.
   */
  listExpensesPage: async (
    groupId: string,
    params: { limit?: number; cursor?: string } = {}
  ): Promise<ExpensesPage> => {
    const search = new URLSearchParams();
    search.set("groupId", groupId);
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    if (params.cursor !== undefined) search.set("cursor", params.cursor);

    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    // Browser-only: this method calls `/api/expenses` on the same
    // origin so we can read the response from the BFF route. Throw
    // loudly — never silently produce a relative-path fetch — when
    // it ever runs outside a browser (RSC, SSR pre-render).
    if (typeof window === "undefined") {
      throw new Error(
        "listExpensesPage requires a browser context (SSR/RSC)."
      );
    }
    const origin = window.location.origin;
    const res = await fetch(`${origin}/api/expenses?${search.toString()}`, {
      headers,
    });

    if (res.status === 401 && token) {
      useAuth.getState().clear();
    }

    if (!res.ok) {
      const { code, message } = await parseErrorBody(res);
      throw new ApiRequestError(res.status, code, message);
    }

    // 204 No Content: treat as the end of the stream — return an
    // empty page so callers can stop iterating without special-casing.
    if (res.status === 204) {
      return { data: [], nextCursor: null };
    }
    return (await res.json()) as ExpensesPage;
  },
  getExpense: (id: string) => request<ExpenseResponse>(`/expenses/${id}`),
  updateExpense: (id: string, data: UpdateExpenseRequest) =>
    request<ExpenseResponse>(`/expenses/${id}`, { method: "PATCH", json: data }),
  deleteExpense: (id: string) =>
    request<{ ok: boolean }>(`/expenses/${id}`, { method: "DELETE" }),

  // -- settlement -------------------------------------------------------------
  settleExpense: (expenseId: string, data: SettleExpenseRequest = {}) =>
    request<SettlementIntentResponse>(`/expenses/${expenseId}/settle`, {
      method: "POST",
      json: data,
      schema: SettlementIntentResponseSchema as unknown as z.ZodType<SettlementIntentResponse>,
    }),
  createSettlement: (groupId: string, data: CreateSettlementRequest) =>
    request<SettlementIntentResponse>(`/groups/${groupId}/settlements`, {
      method: "POST",
      json: data,
      schema: SettlementIntentResponseSchema as unknown as z.ZodType<SettlementIntentResponse>,
    }),
  confirmSettlement: (settlementId: string, data: ConfirmSettlementRequest) =>
    request<SettlementResponse>(`/settlements/${settlementId}/confirm`, {
      method: "POST",
      json: data,
      schema: SettlementResponseSchema as unknown as z.ZodType<SettlementResponse>,
    }),
  /**
   * Polls the current status of a settlement. Used while a settlement is
   * `pending` / `submitted` so the UI can advance to confirmed/failed as
   * the Stellar transaction reaches a terminal state.
   */
  getSettlement: (id: string) =>
    request<SettlementResponse>(`/settlements/${id}`, {
      schema: SettlementResponseSchema as unknown as z.ZodType<SettlementResponse>,
    }),
  getBalances: (groupId: string) =>
    request<BalancesResponse>(`/groups/${groupId}/balances`, {
      schema: BalancesResponseSchema as unknown as z.ZodType<BalancesResponse>,
    }),
  getLedger: (groupId: string) =>
    request<LedgerResponse>(`/groups/${groupId}/ledger`, {
      schema: LedgerResponseSchema as unknown as z.ZodType<LedgerResponse>,
    }),

  // -- treasury ----------------------------------------------------------------
  enableTreasury: (groupId: string, data: EnableTreasuryRequest) =>
    request<GroupResponse>(`/groups/${groupId}/treasury/enable`, {
      method: "POST",
      json: data,
    }),
  treasuryInfo: (groupId: string) =>
    request<TreasuryInfoResponse>(`/groups/${groupId}/treasury`),
  treasuryDeposit: (groupId: string, data: TreasuryDepositRequest) =>
    request<TreasuryIntentResponse>(`/groups/${groupId}/treasury/deposit`, {
      method: "POST",
      json: data,
    }),
  treasuryWithdraw: (groupId: string, data: TreasuryWithdrawRequest) =>
    request<TreasuryIntentResponse>(`/groups/${groupId}/treasury/withdraw`, {
      method: "POST",
      json: data,
    }),
  confirmTreasuryTx: (txId: string, data: ConfirmSettlementRequest) =>
    request<TreasuryTransactionResponse>(
      `/treasury-transactions/${txId}/confirm`,
      { method: "POST", json: data }
    ),
  treasuryHistory: (groupId: string) =>
    request<TreasuryHistoryResponse>(`/groups/${groupId}/treasury/history`),

  // -- anchors -------------------------------------------------------------------
  listAnchors: () => request<AnchorsResponse>("/anchors"),
  anchorDeposit: (data: AnchorDepositRequest) =>
    request<AnchorStartResponse>("/anchors/deposit", {
      method: "POST",
      json: data,
    }),
  anchorWithdraw: (data: AnchorWithdrawRequest) =>
    request<AnchorStartResponse>("/anchors/withdraw", {
      method: "POST",
      json: data,
    }),
  anchorComplete: (sessionId: string, data: AnchorCompleteRequest) =>
    request<AnchorSessionResponse>(`/anchors/sessions/${sessionId}/complete`, {
      method: "POST",
      json: data,
    }),
  anchorSessions: () => request<AnchorSessionsResponse>("/anchors/sessions"),

  // -- history & uploads ------------------------------------------------------------
  history: () =>
    request<HistoryResponse>("/history", {
      schema: HistoryResponseSchema as unknown as z.ZodType<HistoryResponse>,
    }),
  uploadReceipt: async (file: File): Promise<UploadResponse> => {
    const form = new FormData();
    form.append("file", file);
    return request<UploadResponse>("/uploads/receipt", {
      method: "POST",
      body: form,
    });
  },
};
