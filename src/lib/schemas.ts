/**
 * Runtime validation schemas for API responses.
 *
 * TypeScript types in `types.ts` only describe the *expected* shape; Zod here
 * verifies what actually arrived. Wire responses through `request()` with a
 * schema — failures throw `ApiValidationError`, which the UI handles like any
 * other failed request without exposing parser internals.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives & enums — keep in sync with src/lib/types.ts
// ---------------------------------------------------------------------------

const RoleSchema = z.enum(["admin", "member"]);
const SplitTypeSchema = z.enum(["equal", "custom", "percentage"]);
const ShareStatusSchema = z.enum(["pending", "settling", "settled"]);
const SettlementStatusSchema = z.enum([
  "pending",
  "submitted",
  "confirmed",
  "failed",
]);
const TreasuryDirectionSchema = z.enum(["deposit", "withdrawal"]);
const TreasuryTxStatusSchema = z.enum([
  "pending",
  "awaiting_signatures",
  "submitted",
  "confirmed",
  "failed",
]);
const AnchorSessionKindSchema = z.enum(["deposit", "withdrawal"]);
const AnchorSessionStatusSchema = z.enum([
  "incomplete",
  "pending_user_transfer_start",
  "pending_anchor",
  "completed",
  "error",
  "refunded",
]);

// Loose decimal/identifier strings — backend uses signed decimal strings for
// amounts; we only need to assert shape, not enforce numeric precision here.
const DecimalStringSchema = z.string().min(1);
const IsoDateStringSchema = z.string().min(1);

// ---------------------------------------------------------------------------
// Reusable shapes
// ---------------------------------------------------------------------------

const UserSchema = z.object({
  id: z.string(),
  stellarPublicKey: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: IsoDateStringSchema,
});

const GroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  createdByUserId: z.string(),
  treasuryEnabled: z.boolean(),
  treasuryAccountPublicKey: z.string().nullable(),
  treasuryRequiredSigners: z.number().int().nullable(),
  archived: z.boolean(),
  createdAt: IsoDateStringSchema,
});

const GroupMemberSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  userId: z.string(),
  role: RoleSchema,
  joinedAt: IsoDateStringSchema,
  user: UserSchema,
});

const ExpenseShareSchema = z.object({
  id: z.string(),
  expenseId: z.string(),
  userId: z.string(),
  user: UserSchema,
  shareAmount: DecimalStringSchema,
  status: ShareStatusSchema,
});

const ExpenseSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  payerUserId: z.string(),
  payer: UserSchema,
  title: z.string(),
  description: z.string().nullable(),
  amount: DecimalStringSchema,
  assetCode: z.string(),
  assetIssuer: z.string().nullable(),
  splitType: SplitTypeSchema,
  memo: z.string().nullable(),
  receiptUrl: z.string().nullable(),
  createdAt: IsoDateStringSchema,
  shares: z.array(ExpenseShareSchema),
});

const SettlementSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  fromUserId: z.string(),
  from: UserSchema,
  toUserId: z.string(),
  to: UserSchema,
  amount: DecimalStringSchema,
  assetCode: z.string(),
  assetIssuer: z.string().nullable(),
  stellarTxHash: z.string().nullable(),
  status: SettlementStatusSchema,
  memo: z.string().nullable(),
  expenseId: z.string().nullable(),
  createdAt: IsoDateStringSchema,
});

const TreasuryTransactionSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  userId: z.string().nullable(),
  user: UserSchema.nullable(),
  direction: TreasuryDirectionSchema,
  amount: DecimalStringSchema,
  assetCode: z.string(),
  assetIssuer: z.string().nullable(),
  destination: z.string().nullable(),
  stellarTxHash: z.string().nullable(),
  status: TreasuryTxStatusSchema,
  memo: z.string().nullable(),
  createdAt: IsoDateStringSchema,
});

// ---------------------------------------------------------------------------
// Response envelopes
// ---------------------------------------------------------------------------

export const MeResponseSchema = z.object({ user: UserSchema });

export const GroupsResponseSchema = z.object({
  groups: z.array(
    GroupSchema.extend({
      memberCount: z.number().int().nonnegative(),
      yourNet: DecimalStringSchema,
      netAssetCode: z.string(),
    })
  ),
});

export const GroupResponseSchema = z.object({ group: GroupSchema });

export const GroupDetailSchema = z.object({
  group: GroupSchema,
  members: z.array(GroupMemberSchema),
  yourRole: RoleSchema,
});

export const ExpensesResponseSchema = z.object({
  expenses: z.array(ExpenseSchema),
});

export const ExpenseResponseSchema = z.object({ expense: ExpenseSchema });

export const BalancesResponseSchema = z.object({
  balances: z.array(
    z.object({
      userId: z.string(),
      user: UserSchema,
      net: DecimalStringSchema,
      assetCode: z.string(),
    })
  ),
  suggestions: z.array(
    z.object({
      fromUserId: z.string(),
      from: UserSchema,
      toUserId: z.string(),
      to: UserSchema,
      amount: DecimalStringSchema,
      assetCode: z.string(),
      assetIssuer: z.string().nullable(),
    })
  ),
});

export const SettlementResponseSchema = z.object({ settlement: SettlementSchema });

export const SettlementsResponseSchema = z.object({
  settlements: z.array(SettlementSchema),
});

export const LedgerResponseSchema = z.object({
  entries: z.array(
    z.union([
      z.object({
        type: z.literal("expense"),
        createdAt: IsoDateStringSchema,
        expense: ExpenseSchema,
      }),
      z.object({
        type: z.literal("settlement"),
        createdAt: IsoDateStringSchema,
        settlement: SettlementSchema,
      }),
      z.object({
        type: z.literal("treasury"),
        createdAt: IsoDateStringSchema,
        treasuryTransaction: TreasuryTransactionSchema,
      }),
    ])
  ),
  nextCursor: z.string().nullable(),
});

export const HistoryResponseSchema = z.object({
  expenses: z.array(ExpenseSchema),
  settlements: z.array(SettlementSchema),
  nextCursor: z.string().nullable(),
});

// Invites — used when creating or redeeming group invites
const InviteSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  code: z.string(),
  url: z.string(),
  expiresAt: z.string().nullable(),
  maxUses: z.number().int().nullable(),
  uses: z.number().int().nonnegative(),
  createdAt: IsoDateStringSchema,
});

// Anchor info — list of available anchors from backend
const AnchorInfoSchema = z.object({
  name: z.string(),
  homeDomain: z.string(),
  assets: z.array(
    z.object({
      code: z.string(),
      issuer: z.string().nullable(),
    })
  ),
});

// Treasury balance — single asset balance inside the treasury account
const TreasuryBalanceSchema = z.object({
  assetCode: z.string(),
  assetIssuer: z.string().nullable(),
  balance: DecimalStringSchema,
});

// Session shape reused by anchor session schemas
const AnchorSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  anchorName: z.string(),
  kind: AnchorSessionKindSchema,
  assetCode: z.string(),
  interactiveUrl: z.string().nullable(),
  externalTransactionId: z.string().nullable(),
  status: AnchorSessionStatusSchema,
  createdAt: IsoDateStringSchema,
});

// ---------------------------------------------------------------------------
// Additional response envelopes
// ---------------------------------------------------------------------------

// Auth
export const ChallengeResponseSchema = z.object({
  transaction: z.string(),
  networkPassphrase: z.string(),
});

export const VerifyResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
});

// Generic OK envelope used by logout, delete, leave, etc.
export const OkResponseSchema = z.object({
  ok: z.boolean(),
});

// Invites
export const InviteResponseSchema = z.object({ invite: InviteSchema });

// Treasury response envelopes
export const TreasuryInfoResponseSchema = z.object({
  publicKey: z.string(),
  balances: z.array(TreasuryBalanceSchema),
  signers: z.array(
    z.object({ key: z.string(), weight: z.number().int() })
  ),
  thresholds: z.object({
    low: z.number().int(),
    med: z.number().int(),
    high: z.number().int(),
  }),
});

export const TreasuryIntentResponseSchema = z.object({
  treasuryTransaction: TreasuryTransactionSchema,
  xdr: z.string(),
  networkPassphrase: z.string(),
});

export const TreasuryTransactionResponseSchema = z.object({
  treasuryTransaction: TreasuryTransactionSchema,
});

export const TreasuryHistoryResponseSchema = z.object({
  transactions: z.array(TreasuryTransactionSchema),
});

// Anchors
export const AnchorsResponseSchema = z.object({
  anchors: z.array(AnchorInfoSchema),
});

export const AnchorStartResponseSchema = z.object({
  session: AnchorSessionSchema,
  challenge: z.object({
    transaction: z.string(),
    networkPassphrase: z.string(),
  }),
});

// Override the previously internal session response with the shared shape
export const AnchorSessionResponseSchema = z.object({
  session: AnchorSessionSchema,
});

export const AnchorSessionsResponseSchema = z.object({
  sessions: z.array(AnchorSessionSchema),
});

// Receipt upload
export const UploadResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
});

// Settlement intent (build/sign XDR step)
export const SettlementIntentResponseSchema = z.object({
  settlement: SettlementSchema,
  xdr: z.string(),
  networkPassphrase: z.string(),
});
