/**
 * Settlement payload validation (#615).
 *
 * A settlement becomes an on-chain payment, so its inputs are checked before
 * anything is built, signed, or dispatched:
 *
 *  - the amount must be a positive plain decimal that fits Stellar's
 *    7-decimal precision (an amount like `-5`, `1e5`, or `1.12345678` is
 *    rejected here instead of by the ledger),
 *  - a recipient that claims to be a Stellar account must actually be one —
 *    a truncated or mistyped `G…` key would otherwise be sent to the API and
 *    fail only after the user signed,
 *  - an issued asset must carry a checksum-valid issuer,
 *  - the memo is held to the same 28-byte Stellar limit as the expense form.
 *
 * The module is free of React/Next imports so route handlers, dialogs, and
 * unit tests all share the exact same rules. Field types mirror
 * `CreateSettlementRequest` / `ConfirmSettlementRequest` in
 * `src/lib/types.ts`.
 *
 * @module validations/settlement
 */

import { z } from "zod";

import { isValidEd25519PublicKey } from "../strkey";
import { validateExpenseAmount } from "../validation";
import type {
  ConfirmSettlementRequest,
  CreateSettlementRequest,
} from "../types";
import { mergepayMemoSchema } from "./memo";

/** Stellar supports 7 decimal places (1 stroop = 10^-7). */
export const SETTLEMENT_AMOUNT_DECIMALS = 7;

/** Asset codes are 1–12 alphanumeric characters (`XLM`, `USDC`, …). */
export const SETTLEMENT_ASSET_CODE_PATTERN = /^[A-Za-z0-9]{1,12}$/;

const PUBLIC_KEY_MESSAGE =
  "Recipient must be a valid 56-character Stellar public key starting with 'G'";

/**
 * A Stellar account that will receive the payment: checksum-validated
 * ed25519 public key. Used wherever the user types an address directly.
 */
export const settlementDestinationSchema = z
  .string()
  .trim()
  .min(1, "Recipient is required")
  .refine(isValidEd25519PublicKey, { message: PUBLIC_KEY_MESSAGE });

/**
 * Recipient of a settle-up: either a group member id (`user-2`) or a Stellar
 * public key. Ids are only checked for presence, but any value that looks like
 * an account — it starts with `G`/`g` or is long enough to be a key — must be
 * a valid one, so a typo never reaches the transaction builder.
 */
export const settlementRecipientSchema = z
  .string()
  .trim()
  .min(1, "Choose who to pay")
  .superRefine((value, ctx) => {
    const looksLikeKey = /^g/i.test(value) || value.length >= 40;
    if (looksLikeKey && !isValidEd25519PublicKey(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: PUBLIC_KEY_MESSAGE });
    }
  });

/**
 * Settlement amount: strictly positive, plain decimal notation, at most 7
 * decimal places, within Stellar's int64 stroop range. Reuses the exact
 * stroop validator the API route uses, so the form and the server agree on
 * every edge case (negatives, exponents, float drift).
 */
export const settlementAmountSchema = z
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

/** Classic asset code paid in the settlement. */
export const settlementAssetCodeSchema = z
  .string()
  .trim()
  .min(1, "Asset code is required")
  .regex(
    SETTLEMENT_ASSET_CODE_PATTERN,
    "Asset code must be 1-12 letters or digits"
  );

/**
 * Issuer of an issued asset. Optional for the native asset (`XLM`); when it is
 * present it has to be a real account because the payment cannot be built
 * without one.
 */
export const settlementAssetIssuerSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || isValidEd25519PublicKey(value), {
    message: "Asset issuer must be a valid Stellar public key",
  })
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

/**
 * Settle-up form values — the payload `SettleDialog` dispatches to
 * `api.createSettlement`, plus the memo the user can attach.
 */
export const settlementPayloadSchema = z.object({
  toUserId: settlementRecipientSchema,
  amount: settlementAmountSchema,
  assetCode: settlementAssetCodeSchema,
  assetIssuer: settlementAssetIssuerSchema,
  memo: mergepayMemoSchema.nullable().optional(),
});

export type SettlementPayload = z.infer<typeof settlementPayloadSchema>;

/** Backwards-compatible name used by the settlement dialog. */
export const createSettlementFormSchema = settlementPayloadSchema;

export type CreateSettlementFormValues = SettlementPayload;

/**
 * Compile-time assertion: every parsed settlement payload is a valid
 * `CreateSettlementRequest`, so callers can dispatch `parsed.data` straight to
 * the API. If the schema drifts from the contract, this stops typechecking.
 */
export type AssertSettlementContract<
  T extends CreateSettlementRequest = SettlementPayload,
> = T;

/**
 * Body of `POST /settlements/:id/confirm`: the base64 XDR the wallet signed.
 * Rejecting non-base64 input here keeps an obviously broken signature from
 * being submitted for confirmation.
 */
export const settlementConfirmPayloadSchema = z.object({
  signedXdr: z
    .string()
    .trim()
    .min(1, "Signed transaction is required")
    .regex(
      /^[A-Za-z0-9+/]+={0,2}$/,
      "Signed transaction must be base64-encoded XDR"
    ),
});

export type SettlementConfirmPayload = z.infer<
  typeof settlementConfirmPayloadSchema
>;

export type AssertSettlementConfirmContract<
  T extends ConfirmSettlementRequest = SettlementConfirmPayload,
> = T;
