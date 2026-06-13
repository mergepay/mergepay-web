import { API_URL } from "./constants";
import { getToken, useAuth } from "./auth-store";
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

  if (res.status === 401 && token) {
    // Session expired — drop it so the auth guard kicks the user to /login.
    useAuth.getState().clear();
  }

  if (!res.ok) {
    let code = "unknown";
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      code = data?.error?.code ?? code;
      message = data?.error?.message ?? message;
    } catch {
      // non-JSON error body
    }
    throw new ApiRequestError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
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
  me: () => request<MeResponse>("/me"),
  updateMe: (data: UpdateMeRequest) =>
    request<MeResponse>("/me", { method: "PATCH", json: data }),

  // -- groups ---------------------------------------------------------------
  createGroup: (data: CreateGroupRequest) =>
    request<GroupResponse>("/groups", { method: "POST", json: data }),
  listGroups: () => request<GroupsResponse>("/groups"),
  getGroup: (id: string) => request<GroupDetail>(`/groups/${id}`),
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
    }),
  createSettlement: (groupId: string, data: CreateSettlementRequest) =>
    request<SettlementIntentResponse>(`/groups/${groupId}/settlements`, {
      method: "POST",
      json: data,
    }),
  confirmSettlement: (settlementId: string, data: ConfirmSettlementRequest) =>
    request<SettlementResponse>(`/settlements/${settlementId}/confirm`, {
      method: "POST",
      json: data,
    }),
  getBalances: (groupId: string) =>
    request<BalancesResponse>(`/groups/${groupId}/balances`),
  getLedger: (groupId: string) =>
    request<LedgerResponse>(`/groups/${groupId}/ledger`),

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
  history: () => request<HistoryResponse>("/history"),
  uploadReceipt: async (file: File): Promise<UploadResponse> => {
    const form = new FormData();
    form.append("file", file);
    return request<UploadResponse>("/uploads/receipt", {
      method: "POST",
      body: form,
    });
  },
};
