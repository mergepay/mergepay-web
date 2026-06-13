/**
 * Mergepay API contract.
 *
 * This file is the single source of truth for every payload exchanged with
 * mergepay-api. The backend mirrors these shapes with Zod schemas.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Role = "admin" | "member";
export type SplitType = "equal" | "custom" | "percentage";
export type ShareStatus = "pending" | "settling" | "settled";
export type SettlementStatus = "pending" | "submitted" | "confirmed" | "failed";
export type TreasuryDirection = "deposit" | "withdrawal";
export type TreasuryTxStatus =
  | "pending"
  | "awaiting_signatures"
  | "submitted"
  | "confirmed"
  | "failed";
export type AnchorSessionKind = "deposit" | "withdrawal";
export type AnchorSessionStatus =
  | "incomplete"
  | "pending_user_transfer_start"
  | "pending_anchor"
  | "completed"
  | "error"
  | "refunded";

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Users & auth
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  stellarPublicKey: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface ChallengeRequest {
  account: string;
}

export interface ChallengeResponse {
  /** SEP-10 challenge transaction envelope, base64 XDR */
  transaction: string;
  networkPassphrase: string;
}

export interface VerifyRequest {
  /** Signed SEP-10 challenge transaction, base64 XDR */
  transaction: string;
}

export interface VerifyResponse {
  token: string;
  user: User;
}

export interface MeResponse {
  user: User;
}

export interface UpdateMeRequest {
  displayName?: string;
  avatarUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export interface Group {
  id: string;
  name: string;
  description: string | null;
  createdByUserId: string;
  treasuryEnabled: boolean;
  treasuryAccountPublicKey: string | null;
  treasuryRequiredSigners: number | null;
  archived: boolean;
  createdAt: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  role: Role;
  joinedAt: string;
  user: User;
}

export interface GroupSummary extends Group {
  memberCount: number;
  /** Net balance for the requesting user across the group, signed decimal string. */
  yourNet: string;
  netAssetCode: string;
}

export interface GroupDetail {
  group: Group;
  members: GroupMember[];
  yourRole: Role;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
}

export interface GroupsResponse {
  groups: GroupSummary[];
}

export interface GroupResponse {
  group: Group;
}

export interface InviteRequest {
  maxUses?: number;
  expiresInHours?: number;
}

export interface Invite {
  id: string;
  groupId: string;
  code: string;
  url: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  createdAt: string;
}

export interface InviteResponse {
  invite: Invite;
}

export interface JoinGroupRequest {
  code: string;
}

export interface JoinGroupResponse {
  group: Group;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export interface ExpenseShareInput {
  userId: string;
  /** Required for splitType=custom — decimal string */
  amount?: string;
  /** Required for splitType=percentage — 0..100 */
  percent?: number;
}

export interface CreateExpenseRequest {
  title: string;
  description?: string;
  /** Decimal string, e.g. "42.5000000" */
  amount: string;
  assetCode: string;
  assetIssuer?: string | null;
  splitType: SplitType;
  /** Participating members. For equal split only userId is needed. */
  shares: ExpenseShareInput[];
  payerUserId?: string;
  memo?: string;
  receiptUrl?: string | null;
}

export interface UpdateExpenseRequest {
  title?: string;
  description?: string;
  memo?: string;
  receiptUrl?: string | null;
}

export interface ExpenseShare {
  id: string;
  expenseId: string;
  userId: string;
  user: User;
  shareAmount: string;
  status: ShareStatus;
}

export interface Expense {
  id: string;
  groupId: string;
  payerUserId: string;
  payer: User;
  title: string;
  description: string | null;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
  splitType: SplitType;
  memo: string | null;
  receiptUrl: string | null;
  createdAt: string;
  shares: ExpenseShare[];
}

export interface ExpensesResponse {
  expenses: Expense[];
}

export interface ExpenseResponse {
  expense: Expense;
}

// ---------------------------------------------------------------------------
// Balances, settlements & ledger
// ---------------------------------------------------------------------------

export interface MemberBalance {
  userId: string;
  user: User;
  /** Signed decimal string: positive = is owed, negative = owes. */
  net: string;
  assetCode: string;
}

export interface SettlementSuggestion {
  fromUserId: string;
  from: User;
  toUserId: string;
  to: User;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
}

export interface BalancesResponse {
  balances: MemberBalance[];
  suggestions: SettlementSuggestion[];
}

export interface Settlement {
  id: string;
  groupId: string;
  fromUserId: string;
  from: User;
  toUserId: string;
  to: User;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
  stellarTxHash: string | null;
  status: SettlementStatus;
  memo: string | null;
  expenseId: string | null;
  createdAt: string;
}

/** Settle a single expense share (the caller's own share). */
export interface SettleExpenseRequest {
  /** Optional: settle with a different asset via path payment. */
  assetCode?: string;
  assetIssuer?: string | null;
}

/** Settle-up against net balance inside a group. */
export interface CreateSettlementRequest {
  toUserId: string;
  amount: string;
  assetCode: string;
  assetIssuer?: string | null;
}

export interface SettlementIntentResponse {
  settlement: Settlement;
  /** Unsigned payment transaction, base64 XDR — sign with your wallet. */
  xdr: string;
  networkPassphrase: string;
}

export interface ConfirmSettlementRequest {
  signedXdr: string;
}

export interface SettlementResponse {
  settlement: Settlement;
}

export interface SettlementsResponse {
  settlements: Settlement[];
}

export type LedgerEntry =
  | { type: "expense"; createdAt: string; expense: Expense }
  | { type: "settlement"; createdAt: string; settlement: Settlement }
  | { type: "treasury"; createdAt: string; treasuryTransaction: TreasuryTransaction };

export interface LedgerResponse {
  entries: LedgerEntry[];
}

// ---------------------------------------------------------------------------
// Treasury
// ---------------------------------------------------------------------------

export interface TreasuryTransaction {
  id: string;
  groupId: string;
  userId: string | null;
  user: User | null;
  direction: TreasuryDirection;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
  destination: string | null;
  stellarTxHash: string | null;
  status: TreasuryTxStatus;
  memo: string | null;
  createdAt: string;
}

export interface EnableTreasuryRequest {
  /** Public key of the shared treasury account (created in the wallet, never by the API). */
  publicKey: string;
  requiredSigners?: number;
}

export interface TreasuryDepositRequest {
  amount: string;
  assetCode: string;
  assetIssuer?: string | null;
}

export interface TreasuryWithdrawRequest {
  amount: string;
  assetCode: string;
  assetIssuer?: string | null;
  destination: string;
}

export interface TreasuryIntentResponse {
  treasuryTransaction: TreasuryTransaction;
  xdr: string;
  networkPassphrase: string;
}

export interface TreasuryTransactionResponse {
  treasuryTransaction: TreasuryTransaction;
}

export interface TreasuryHistoryResponse {
  transactions: TreasuryTransaction[];
}

export interface TreasuryBalance {
  assetCode: string;
  assetIssuer: string | null;
  balance: string;
}

export interface TreasuryInfoResponse {
  publicKey: string;
  balances: TreasuryBalance[];
  signers: { key: string; weight: number }[];
  thresholds: { low: number; med: number; high: number };
}

// ---------------------------------------------------------------------------
// Anchors (SEP-24)
// ---------------------------------------------------------------------------

export interface AnchorInfo {
  name: string;
  homeDomain: string;
  assets: { code: string; issuer: string | null }[];
}

export interface AnchorsResponse {
  anchors: AnchorInfo[];
}

export interface AnchorSession {
  id: string;
  userId: string;
  anchorName: string;
  kind: AnchorSessionKind;
  assetCode: string;
  /** SEP-24 interactive URL to open in a popup/iframe. */
  interactiveUrl: string | null;
  externalTransactionId: string | null;
  status: AnchorSessionStatus;
  createdAt: string;
}

export interface AnchorDepositRequest {
  assetCode: string;
  anchorName?: string;
}

export interface AnchorWithdrawRequest {
  assetCode: string;
  anchorName?: string;
}

/**
 * Step 1 of a SEP-24 flow: the API fetches a SEP-10 challenge *from the
 * anchor* for the user's account. The wallet signs it, then the client calls
 * POST /anchors/sessions/:id/complete to exchange it for the interactive URL.
 */
export interface AnchorStartResponse {
  session: AnchorSession;
  challenge: {
    transaction: string;
    networkPassphrase: string;
  };
}

export interface AnchorCompleteRequest {
  signedXdr: string;
}

export interface AnchorSessionResponse {
  session: AnchorSession;
}

export interface AnchorSessionsResponse {
  sessions: AnchorSession[];
}

// ---------------------------------------------------------------------------
// History & uploads
// ---------------------------------------------------------------------------

export interface HistoryResponse {
  expenses: Expense[];
  settlements: Settlement[];
}

export interface UploadResponse {
  id: string;
  url: string;
}
