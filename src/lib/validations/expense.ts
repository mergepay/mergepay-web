/**
 * Client-side Zod validation for the expense creation workflow (#391).
 *
 * This is the single schema that defines what a valid expense-creation
 * payload looks like *before* it leaves the browser. The form uses it as the
 * final submit gate (on top of the per-field inline errors from
 * `expenseValidation.ts`), and it mirrors the contract the API re-checks on
 * the server — so a malformed submission can never reach the Stellar network
 * or the backend API.
 *
 * All amount arithmetic runs on integer stroops (1 stroop = 10^-7, the
 * smallest unit Stellar represents), reusing `parseDecimalUnits` from
 * `expenseValidation.ts`. Comparing decimal sums as JavaScript numbers gives
 * wrong answers for ordinary inputs — `0.1 + 0.2 === 0.3` is false — so no
 * split total is ever compared as a float.
 *
 * The module is free of React/Next.js imports so it is unit-testable under
 * plain `node --test` (and safe for any future server-side caller).
 */

import { z } from "zod";
import {
  AMOUNT_DECIMAL_PLACES,
  formatAmountUnits,
  formatDecimalUnits,
  MAX_TITLE_LENGTH,
  parseDecimalUnits,
  PERCENT_DECIMAL_PLACES,
} from "../expenseValidation";

/** Stellar text-memo limit (28 bytes) — the bound the form's memo must fit. */
export const EXPENSE_MEMO_MAX_LENGTH = 28;

/** 100% in the integer units used for percentage arithmetic. */
const ONE_HUNDRED_PERCENT = 100n * 10n ** BigInt(PERCENT_DECIMAL_PLACES);

/** ASCII control characters that are invalid in a Stellar memo. */
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f-\x9f]/;

/**
 * A single share of an expense. `userId` is the group member's id; the
 * `amount` / `percent` fields are required by `splitType` and validated in
 * the schema's `superRefine` (never with float arithmetic).
 */
const expenseShareInputSchema = z.object({
  userId: z
    .string()
    .trim()
    .min(1, "Participant is required"),
  /** Decimal string — required for splitType "custom". */
  amount: z.string().optional(),
  /** 0..100 — required for splitType "percentage". */
  percent: z
    .number()
    .finite()
    .min(0, "Percentage must be between 0 and 100")
    .max(100, "Percentage must be between 0 and 100")
    .optional(),
});

/**
 * Validate the amount field with the same rules (and messages) as the
 * per-field validator, so the submit gate and the inline errors agree.
 */
function checkAmount(raw: string, ctx: z.RefinementCtx): void {
  if (!raw.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Amount is required" });
    return;
  }
  const units = parseDecimalUnits(raw, AMOUNT_DECIMAL_PLACES);
  if (units === "too_precise") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Amount can have at most ${AMOUNT_DECIMAL_PLACES} decimal places`,
    });
    return;
  }
  if (units === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter an amount as a plain number, for example 42.50",
    });
    return;
  }
  if (units <= 0n) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Amount must be greater than zero",
    });
  }
}

/**
 * Schema for the complete expense-creation payload.
 *
 * Shape matches `CreateExpenseRequest` in `src/lib/types.ts`. Extra keys are
 * stripped, fields are trimmed, and the split allocations are verified
 * stroop-exactly:
 *   - "custom": share amounts must sum to the total, to the stroop.
 *   - "percentage": percentages must sum to exactly 100%.
 *   - "equal": shares are derived, but the amount must still be large enough
 *     that every participant receives at least one stroop.
 */
export const expenseFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(
        MAX_TITLE_LENGTH,
        `Title must be ${MAX_TITLE_LENGTH} characters or fewer`
      ),
    description: z.string().trim().optional(),
    amount: z.string().superRefine(checkAmount),
    assetCode: z.string().trim().min(1, "Asset code is required"),
    assetIssuer: z.string().nullable().optional(),
    splitType: z.enum(["equal", "custom", "percentage"], {
      errorMap: () => ({ message: "Choose how to split this expense" }),
    }),
    shares: z
      .array(expenseShareInputSchema)
      .min(1, "Select at least one participant"),
    payerUserId: z
      .string()
      .trim()
      .min(1, "Choose who paid")
      .optional(),
    memo: z
      .string()
      .trim()
      .max(
        EXPENSE_MEMO_MAX_LENGTH,
        `Memo can be at most ${EXPENSE_MEMO_MAX_LENGTH} characters`
      )
      .refine(
        (value) => !CONTROL_CHAR_RE.test(value),
        "Memo cannot contain control characters"
      )
      .optional(),
    receiptUrl: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const amountUnits = parseDecimalUnits(data.amount, AMOUNT_DECIMAL_PLACES);

    if (data.splitType === "custom") {
      if (typeof amountUnits !== "bigint") return; // amount already reported

      let sum = 0n;
      for (const share of data.shares) {
        const raw = share.amount;
        if (raw === undefined || !raw.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares"],
            message: "Enter an amount for every participant",
          });
          return;
        }
        const units = parseDecimalUnits(raw, AMOUNT_DECIMAL_PLACES);
        if (units === "too_precise") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares"],
            message: `Each share can have at most ${AMOUNT_DECIMAL_PLACES} decimal places`,
          });
          return;
        }
        if (units === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares"],
            message: "Each share must be a plain number",
          });
          return;
        }
        if (units <= 0n) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares"],
            message: "Each share must be greater than zero",
          });
          return;
        }
        sum += units;
      }

      if (sum !== amountUnits) {
        const difference = sum - amountUnits;
        const target = formatAmountUnits(amountUnits);
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shares"],
          message:
            difference > 0n
              ? `Shares are over by ${formatAmountUnits(difference)} — they must add up to ${target}`
              : `Shares are short by ${formatAmountUnits(-difference)} — they must add up to ${target}`,
        });
      }
      return;
    }

    if (data.splitType === "percentage") {
      let sum = 0n;
      for (const share of data.shares) {
        if (share.percent === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares"],
            message: "Enter a percentage for every participant",
          });
          return;
        }
        // Reject percentages with more than 2 decimal places (33.333)
        // rather than silently rounding them away.
        const hundredths = share.percent * 100;
        if (Math.abs(Math.round(hundredths) - hundredths) > 1e-9) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares"],
            message: `Percentages can have at most ${PERCENT_DECIMAL_PLACES} decimal places`,
          });
          return;
        }
        sum += BigInt(Math.round(hundredths));
      }

      if (sum !== ONE_HUNDRED_PERCENT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shares"],
          message: `Percentages add up to ${formatDecimalUnits(
            sum,
            PERCENT_DECIMAL_PLACES
          )}% — they must add up to 100%`,
        });
      }
      return;
    }

    // splitType === "equal": the split is derived, so it always sums to the
    // amount — but only while every participant can receive at least one
    // stroop. Below that the split would silently drop people to zero.
    if (
      typeof amountUnits === "bigint" &&
      data.shares.length > 0 &&
      amountUnits < BigInt(data.shares.length)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: `Amount is too small to split between ${data.shares.length} people`,
      });
    }
  });

/** The validated expense-creation payload. */
export type ExpenseFormPayload = z.infer<typeof expenseFormSchema>;
