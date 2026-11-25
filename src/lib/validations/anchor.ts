/**
 * SEP-24 anchor deposit / withdrawal form validation (#490).
 *
 * Fiat on/off-ramp flows prefill the anchor's interactive page with an
 * amount, a destination account and a memo. Those values end up on-chain (or
 * in the anchor's transfer record), so a malformed value is not cosmetic: a
 * bad amount is rejected by the anchor and a mistyped destination is money
 * routed to the wrong account. They are validated here, before anything is
 * sent to the API, with copy the form can render inline.
 *
 * The module is dependency-free (no React) so it can be unit tested and
 * reused by any surface that starts a SEP-24 session. Field types stay in
 * sync with `AnchorDepositRequest` / `AnchorWithdrawRequest` in
 * `src/lib/types.ts`.
 *
 * @module validations/anchor
 */

import { z } from "zod";

import { isValidEd25519PublicKey } from "../strkey";
import { validateExpenseAmount } from "../validation";
import { STELLAR_MEMO_MAX_BYTES } from "../memoValidation";

export { STELLAR_MEMO_MAX_BYTES };

/** Stellar asset codes: 1–12 alphanumeric characters (XLM, USDC, …). */
export const ANCHOR_ASSET_CODE_PATTERN = /^[A-Za-z0-9]{1,12}$/;

/** ASCII control characters, which cannot travel in a Stellar text memo. */
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f-\x9f]/;

/** Empty means "leave it to the anchor" — the field is a prefill, not a requirement. */
function isEmptyField(value: string): boolean {
  return value.trim() === "";
}

/**
 * Transfer amount as a plain decimal string.
 *
 * Empty is allowed (the anchor asks for the amount on its own page);
 * anything else must be a positive, plain decimal that fits Stellar's
 * 7-decimal, int64-magnitude limits — the same rules the expense form uses.
 */
export const anchorAmountSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    if (isEmptyField(value)) return;
    const result = validateExpenseAmount(value);
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.error ?? "Enter a valid amount",
      });
    }
  });

/** Same as {@link anchorAmountSchema} but a blank value is an error. */
export const requiredAnchorAmountSchema = anchorAmountSchema.superRefine(
  (value, ctx) => {
    if (isEmptyField(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount is required",
      });
    }
  }
);

/**
 * Destination Stellar account. Empty means "use the connected account";
 * anything else must be a checksum-valid ed25519 public key, so a truncated
 * or mistyped key never reaches the network.
 */
export const anchorDestinationSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    if (isEmptyField(value)) return;
    if (!isValidEd25519PublicKey(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Destination must be a valid 56-character Stellar public key starting with G",
      });
    }
  });

/** Same as {@link anchorDestinationSchema} but a blank value is an error. */
export const requiredAnchorDestinationSchema = anchorDestinationSchema.superRefine(
  (value, ctx) => {
    if (isEmptyField(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Destination account is required",
      });
    }
  }
);

/**
 * Text memo for the anchor transaction: optional, single line, within the
 * 28-byte Stellar text-memo limit and free of control characters.
 */
export const anchorMemoSchema = z
  .string()
  .superRefine((value, ctx) => {
    const trimmed = value.trim();
    if (trimmed === "") return;

    if (/[\r\n]/.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Memo must be a single line of text",
      });
      return;
    }

    if (CONTROL_CHAR_RE.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Memo contains control characters that are not allowed on Stellar",
      });
      return;
    }

    const byteLength = new TextEncoder().encode(trimmed).length;
    if (byteLength > STELLAR_MEMO_MAX_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Memo exceeds the Stellar limit of ${STELLAR_MEMO_MAX_BYTES} bytes (currently ${byteLength})`,
      });
    }
  });

/** Same as {@link anchorMemoSchema} but a blank value is an error. */
export const requiredAnchorMemoSchema = anchorMemoSchema.superRefine(
  (value, ctx) => {
    if (value.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Memo is required",
      });
    }
  }
);

/**
 * Everything a SEP-24 start request carries. The three prefill fields are
 * optional on purpose — the anchor's hosted page collects whatever is
 * missing — but when they are filled in they must be valid.
 */
export const anchorTransferSchema = z.object({
  kind: z.enum(["deposit", "withdrawal"]),
  assetCode: z
    .string()
    .trim()
    .regex(
      ANCHOR_ASSET_CODE_PATTERN,
      "Asset code must be 1–12 alphanumeric characters"
    ),
  anchorName: z.string().trim().min(1, "Choose an anchor to continue"),
  amount: anchorAmountSchema,
  destination: anchorDestinationSchema,
  memo: anchorMemoSchema,
});

export type AnchorTransferFormInput = z.infer<typeof anchorTransferSchema>;

export type AnchorTransferFieldErrors = Partial<
  Record<keyof AnchorTransferFormInput, string>
>;

/**
 * Validate a transfer form and return per-field messages for inline display.
 *
 * The first failing issue per field wins, so the user is never shown two
 * conflicting messages for one input.
 */
export function anchorTransferFieldErrors(
  input: AnchorTransferFormInput
): AnchorTransferFieldErrors {
  const result = anchorTransferSchema.safeParse(input);
  if (result.success) return {};

  const errors: AnchorTransferFieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string" || key in errors) continue;
    errors[key as keyof AnchorTransferFieldErrors] = issue.message;
  }
  return errors;
}

/**
 * Build the API body for a SEP-24 start request, dropping prefill fields the
 * user left blank so the payload keeps its exact historical shape when
 * nothing extra was entered.
 */
export function buildAnchorTransferPayload(
  input: Pick<
    AnchorTransferFormInput,
    "assetCode" | "anchorName" | "amount" | "destination" | "memo"
  >
): {
  assetCode: string;
  anchorName: string;
  amount?: string;
  destination?: string;
  memo?: string;
} {
  const payload: {
    assetCode: string;
    anchorName: string;
    amount?: string;
    destination?: string;
    memo?: string;
  } = {
    assetCode: input.assetCode,
    anchorName: input.anchorName,
  };

  const amount = input.amount.trim();
  const destination = input.destination.trim();
  const memo = input.memo.trim();

  if (amount) payload.amount = amount;
  if (destination) payload.destination = destination;
  if (memo) payload.memo = memo;

  return payload;
}
