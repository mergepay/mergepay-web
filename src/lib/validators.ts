/**
 * Reusable Zod validation schemas for user-facing forms (#339).
 *
 * The expense side already validates at three layers
 * (`expenseFormSchema` in `src/lib/validations/expense.ts`, the payload
 * gate in `src/lib/validation.ts`, and the API's own schemas). Group
 * creation, treasury enable/deposit/withdraw and settlement forms did the
 * same checks ad hoc inside their submit handlers — a toast per rule, no
 * inline messages, and no shared contract between dialogs.
 *
 * This module is the one place those rules live. Every schema:
 *  - mirrors the request types in `src/lib/types.ts` (compile-time-checked
 *    where the payload dispatches straight to the API),
 *  - reuses the shared primitives (`isValidEd25519PublicKey` for Stellar
 *    keys, exact stroop parsing for amounts) instead of re-deriving them,
 *  - returns user-ready messages on the matching field path, so forms can
 *    render inline errors with `aria-describedby` wiring.
 *
 * Free of React/Next imports so route handlers and tests can use it too.
 */

import { z } from "zod";

import { isValidEd25519PublicKey } from "./strkey";
import { validateExpenseAmount } from "./validation";
import type {
  CreateGroupRequest,
  CreateSettlementRequest,
  EnableTreasuryRequest,
  TreasuryDepositRequest,
  TreasuryWithdrawRequest,
} from "./types";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Stellar Ed25519 public key: `G` + 55 base-32 characters. */
const stellarPublicKey = z
  .string()
  .trim()
  .min(1, "Stellar public key is required")
  .refine(isValidEd25519PublicKey, {
    message:
      "Must be a valid 56-character Stellar public key starting with 'G'",
  });

/**
 * Positive Stellar amount as a plain decimal string: > 0, at most 7 decimal
 * places, no signs/exponents/separators. Reuses the exact stroop validator
 * the API route and the expense schema already share.
 */
const positiveAmount = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .superRefine((value, ctx) => {
    const result = validateExpenseAmount(value);
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.error ?? "Amount must be a positive number",
      });
    }
  });

/** Optional free text that collapses whitespace-only values to `undefined`. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} cannot exceed ${max} characters`)
    .optional()
    .transform((value) => (value ? value : undefined));

// ---------------------------------------------------------------------------
// Group creation (#339)
// ---------------------------------------------------------------------------

/** Group name: 2–60 characters of visible text. */
export const groupNameSchema = z
  .string()
  .trim()
  .min(2, "Group name must be at least 2 characters")
  .max(60, "Group name cannot exceed 60 characters");

/**
 * Group creation form. Mirrors `CreateGroupRequest` (see `src/lib/types.ts`):
 * a non-empty name and an optional description. `description` normalises a
 * whitespace-only entry to `undefined`, matching what the dialog submits.
 */
export const createGroupFormSchema = z.object({
  name: groupNameSchema,
  description: optionalText(280, "Description"),
});

export type CreateGroupFormValues = z.infer<typeof createGroupFormSchema>;

/**
 * Compile-time assertion: the parsed form maps onto the API contract. If the
 * schema drifts from `CreateGroupRequest`, this stops typechecking.
 */
export type AssertCreateGroupContract<
  T extends CreateGroupRequest = CreateGroupFormValues,
> = T;

// ---------------------------------------------------------------------------
// Settlement (settle-up) (#339)
// ---------------------------------------------------------------------------

/**
 * One settlement input row: who to pay, how much, in which asset. Mirrors
 * `CreateSettlementRequest`; the recipient must be a real Stellar account
 * because the API builds an on-chain payment to it.
 */
export const createSettlementFormSchema = z.object({
  toUserId: z.string().trim().min(1, "Choose who to pay"),
  amount: positiveAmount,
  assetCode: z.string().trim().min(1, "Asset code is required"),
  assetIssuer: z
    .string()
    .trim()
    .refine((value) => value === "" || isValidEd25519PublicKey(value), {
      message: "Asset issuer must be a valid Stellar public key",
    })
    .optional()
    .nullable(),
});

export type CreateSettlementFormValues = z.infer<
  typeof createSettlementFormSchema
>;

export type AssertSettlementContract<
  T extends CreateSettlementRequest = CreateSettlementFormValues,
> = T;

// ---------------------------------------------------------------------------
// Treasury (#339)
// ---------------------------------------------------------------------------

/**
 * Enable-treasury form. Mirrors `EnableTreasuryRequest`: the group's shared
 * account public key (created in the wallet, never by the API) and the
 * withdrawal signature threshold.
 */
export const enableTreasuryFormSchema = z.object({
  publicKey: stellarPublicKey,
  requiredSigners: z
    .number({ invalid_type_error: "Choose how many signers are required" })
    .int("Signer threshold must be a whole number")
    .min(1, "At least one signer is required")
    .max(20, "At most 20 signers are supported"),
});

export type EnableTreasuryFormValues = z.infer<typeof enableTreasuryFormSchema>;

export type AssertEnableTreasuryContract<
  T extends EnableTreasuryRequest = EnableTreasuryFormValues,
> = T;

/**
 * Treasury deposit. Mirrors `TreasuryDepositRequest`: a positive amount and a
 * supported asset, with an issuer required for non-native assets.
 */
export const treasuryDepositFormSchema = z
  .object({
    amount: positiveAmount,
    assetCode: z.string().trim().min(1, "Asset code is required"),
    assetIssuer: z
      .string()
      .trim()
      .refine((value) => value === "" || isValidEd25519PublicKey(value), {
        message: "Asset issuer must be a valid Stellar public key",
      })
      .optional()
      .nullable(),
  })
  .superRefine((data, ctx) => {
    const isNative = data.assetCode.toUpperCase() === "XLM";
    if (!isNative && !data.assetIssuer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assetIssuer"],
        message: "Issued assets require an issuer public key",
      });
    }
  });

export type TreasuryDepositFormValues = z.infer<
  typeof treasuryDepositFormSchema
>;

export type AssertTreasuryDepositContract<
  T extends TreasuryDepositRequest = TreasuryDepositFormValues,
> = T;

/**
 * Treasury withdrawal. Mirrors `TreasuryWithdrawRequest`: a positive amount,
 * a supported asset, and a valid destination public key — checked here so a
 * malformed destination never reaches the transaction builder.
 */
export const treasuryWithdrawFormSchema = z
  .object({
    amount: positiveAmount,
    assetCode: z.string().trim().min(1, "Asset code is required"),
    assetIssuer: z
      .string()
      .trim()
      .refine((value) => value === "" || isValidEd25519PublicKey(value), {
        message: "Asset issuer must be a valid Stellar public key",
      })
      .optional()
      .nullable(),
    destination: stellarPublicKey,
  })
  .superRefine((data, ctx) => {
    const isNative = data.assetCode.toUpperCase() === "XLM";
    if (!isNative && !data.assetIssuer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assetIssuer"],
        message: "Issued assets require an issuer public key",
      });
    }
  });

export type TreasuryWithdrawFormValues = z.infer<
  typeof treasuryWithdrawFormSchema
>;

export type AssertTreasuryWithdrawContract<
  T extends TreasuryWithdrawRequest = TreasuryWithdrawFormValues,
> = T;

// ---------------------------------------------------------------------------
// Participant email / address split (#339)
// ---------------------------------------------------------------------------

/**
 * A participant entry in an invite/email split: either a display identifier
 * (member id) or a contact address. Used by invite flows that accept a list
 * of "name <email>" or bare-address entries; keeps the shared non-empty rule
 * in one place.
 */
export const participantEntrySchema = z.object({
  /** Member id when the participant is already in the group. */
  userId: z.string().trim().min(1, "Participant is required"),
  /**
   * Contact email/address for a split notification. Accepts a bare email or
   * a Stellar public key — the two identities a participant can carry.
   */
  contact: z
    .string()
    .trim()
    .min(1, "Contact is required")
    .refine(
      (value) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
        isValidEd25519PublicKey(value),
      "Enter a valid email address or Stellar public key"
    ),
});

export const participantSplitSchema = z
  .array(participantEntrySchema)
  .min(1, "At least one participant is required")
  .superRefine((entries, ctx) => {
    const seen = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      const key = entry.userId.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "userId"],
          message: "A participant appears more than once",
        });
      }
      seen.add(key);
    }
  });

export type ParticipantEntry = z.infer<typeof participantEntrySchema>;
export type ParticipantSplit = z.infer<typeof participantSplitSchema>;

// ---------------------------------------------------------------------------
// Field-error helper
// ---------------------------------------------------------------------------

/**
 * Flatten a failed parse into `{ fieldPath: message }`, keeping the *first*
 * issue per path so forms show one stable error per field. Keys are
 * dotted (`shares.0.amount`), matching how nested forms index their state.
 */
export function fieldErrorsFrom(
  result: z.SafeParseReturnType<unknown, unknown>
): Record<string, string> {
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
