/**
 * Validation schemas and helpers for client forms and server API routes.
 *
 * Kept free of React/Next.js imports so it can be used from route handlers,
 * client components, and unit tests alike.
 */

import { z } from "zod";

import type { CreateExpenseRequest } from "./types";
import {
  AMOUNT_DECIMAL_PLACES,
  MAX_TITLE_LENGTH,
  PERCENT_DECIMAL_PLACES,
  formatAmountUnits,
  formatDecimalUnits,
  parseDecimalUnits,
} from "./expenseValidation";

// ---------------------------------------------------------------------------
// Server-side / API Amount Validation
// ---------------------------------------------------------------------------

/** Decimal places Stellar supports for a classic asset (1 stroop = 10^-7). */
export const DEFAULT_ASSET_DECIMALS = 7;

/**
 * Per-asset decimal precision overrides.
 */
export const ASSET_DECIMALS: Readonly<Record<string, number>> = {};

/**
 * Largest amount representable on Stellar: int64 max stroops
 * (9,223,372,036,854,775,807) expressed in whole units.
 */
export const MAX_STROOPS = 9_223_372_036_854_775_807n;

/** Decimal precision allowed for `assetCode`, falling back to Stellar's 7. */
export function decimalsForAsset(assetCode?: string | null): number {
  if (!assetCode) return DEFAULT_ASSET_DECIMALS;
  return ASSET_DECIMALS[assetCode.trim().toUpperCase()] ?? DEFAULT_ASSET_DECIMALS;
}

export interface AmountValidationResult {
  valid: boolean;
  /** Descriptive reason the amount was rejected. Absent when `valid`. */
  error?: string;
  /**
   * The amount as a plain decimal string, safe to forward upstream.
   * Absent when the amount was rejected.
   */
  normalized?: string;
}

/** Plain decimal notation only — no sign, no exponent, no separators. */
const PLAIN_DECIMAL_RE = /^\d+(\.\d*)?$/;

function invalid(error: string): AmountValidationResult {
  return { valid: false, error };
}

/**
 * Convert a validated plain decimal string to integer stroops so magnitude and
 * "greater than zero" can be checked exactly, without floating-point rounding.
 */
function toStroops(plain: string, decimals: number): bigint {
  const dot = plain.indexOf(".");
  const intPart = dot === -1 ? plain : plain.slice(0, dot);
  const fracPart = dot === -1 ? "" : plain.slice(dot + 1);
  const scale = 10n ** BigInt(decimals);
  const frac = fracPart.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(intPart) * scale + BigInt(frac || "0");
}

/** Inverse of {@link toStroops}: render integer units back as a decimal string. */
function unitsToDecimal(units: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / scale;
  const frac = (abs % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${frac ? `${whole}.${frac}` : `${whole}`}`;
}

/**
 * Validate an expense amount before any processing.
 */
export function validateExpenseAmount(
  amount: unknown,
  assetCode?: string | null
): AmountValidationResult {
  const decimals = decimalsForAsset(assetCode);

  let raw: string;
  if (typeof amount === "string") {
    raw = amount.trim();
  } else if (typeof amount === "number") {
    if (!Number.isFinite(amount)) {
      return invalid("Amount must be a finite number");
    }
    const fixed = amount.toFixed(decimals);
    raw = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  } else if (typeof amount === "bigint") {
    raw = amount.toString();
  } else {
    return invalid("Amount is required and must be a number or decimal string");
  }

  if (raw === "") {
    return invalid("Amount is required");
  }

  if (!PLAIN_DECIMAL_RE.test(raw)) {
    return invalid(
      "Amount must be a positive decimal number without signs, separators, or exponents"
    );
  }

  const plain = raw.endsWith(".") ? raw.slice(0, -1) : raw;

  const dot = plain.indexOf(".");
  if (dot !== -1 && plain.length - dot - 1 > decimals) {
    return invalid(
      `Amount must have at most ${decimals} decimal place${
        decimals === 1 ? "" : "s"
      }`
    );
  }

  const stroops = toStroops(plain, decimals);
  if (stroops <= 0n) {
    return invalid("Amount must be greater than zero");
  }
  if (stroops > MAX_STROOPS) {
    return invalid("Amount exceeds the maximum supported by Stellar");
  }

  return { valid: true, normalized: plain };
}

// ---------------------------------------------------------------------------
// Client-side Zod Validation Schemas (#284)
// ---------------------------------------------------------------------------

/**
 * Stellar Ed25519 Public Key regex: 56 uppercase alphanumeric characters starting with 'G'.
 */
export const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

export const stellarPublicKeySchema = z
  .string()
  .trim()
  .regex(STELLAR_PUBLIC_KEY_REGEX, "Must be a valid 56-character Stellar public key starting with 'G'");

/**
 * Group creation validation schema.
 */
export const createGroupSchema = z.object({
  name: z.string().trim().min(2, "Group name must be at least 2 characters").max(100, "Group name cannot exceed 100 characters"),
  currency: z.string().trim().min(1, "Currency / Asset Code is required"),
  initialMembers: z
    .array(z.string().trim())
    .optional()
    .default([]),
});

export type CreateGroupFormInput = z.infer<typeof createGroupSchema>;

/**
 * Expense share allocation schema.
 *
 * `amount` is the per-member allocation of a custom split. Zero is allowed
 * (an unset row), but the string has to be plain decimal notation within the
 * asset's precision — anything else cannot be represented on the ledger, and
 * a float here would make the split-sum check in `createExpenseSchema`
 * approximate rather than exact.
 */
export const expenseShareInputSchema = z.object({
  userId: z.string().trim().min(1, "Member ID is required"),
  amount: z
    .string()
    .optional()
    .refine(
      (val) => val === undefined || decimalQuantityRegex().test(val.trim()),
      `Share amount must be a plain number with at most ${DEFAULT_ASSET_DECIMALS} decimal places`
    ),
  percent: z
    .number()
    .optional()
    .refine((val) => val === undefined || (val >= 0 && val <= 100), {
      message: "Percentage must be between 0 and 100",
    }),
});

/** Plain decimal quantity, zero included: `^\d+(\.\d{1,n})?$` for the asset. */
function decimalQuantityRegex(decimals: number = DEFAULT_ASSET_DECIMALS): RegExp {
  return new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`);
}

/** Count the fractional digits a decimal string carries. */
function decimalPlacesOf(value: string): number {
  const dot = value.indexOf(".");
  return dot === -1 ? 0 : value.length - dot - 1;
}

/**
 * Expense creation form validation schema.
 *
 * Amounts run through `validateExpenseAmount` — the exact stroop validator the
 * API route uses — rather than `Number()`: float checks accepted "1e-9" and
 * "0.000000001", both of which Stellar cannot represent, and rejected nothing
 * a submission could legitimately send.
 */
export const createExpenseSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(120, "Title cannot exceed 120 characters"),
    description: z.string().trim().optional(),
    amount: z
      .string()
      .trim()
      .min(1, "Amount is required")
      .superRefine((val, ctx) => {
        const result = validateExpenseAmount(val);
        if (!result.valid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: result.error ?? "Amount must be a positive number",
          });
        }
      }),
    assetCode: z.string().trim().min(1, "Asset code is required"),
    payerUserId: z.string().trim().min(1, "Payer member is required"),
    splitType: z.enum(["equal", "custom", "percentage"]),
    shares: z.array(expenseShareInputSchema).min(1, "At least one participating member is required"),
    memo: z.string().trim().optional(),
    receiptUrl: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const total = validateExpenseAmount(data.amount, data.assetCode);
    if (!total.valid || !total.normalized) return;
    const decimals = decimalsForAsset(data.assetCode);
    const totalUnits = toStroops(total.normalized, decimals);

    if (data.splitType === "percentage") {
      const sumPercent = data.shares.reduce((acc, s) => acc + (s.percent ?? 0), 0);
      if (Math.abs(sumPercent - 100) > 0.01) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shares"],
          message: `Split percentages must sum to 100% (currently ${sumPercent.toFixed(2)}%)`,
        });
      }
    }

    if (data.splitType === "custom") {
      // Exact integer sum: adding the shares as floats makes 10 + 20 + 10.0000001
      // and 10 + 20 + 10 both look like they need a tolerance.
      let sumUnits = 0n;
      let malformed = false;
      for (const share of data.shares) {
        const raw = (share.amount ?? "0").trim();
        if (!decimalQuantityRegex(decimals).test(raw) || decimalPlacesOf(raw) > decimals) {
          malformed = true;
          continue;
        }
        sumUnits += toStroops(raw, decimals);
      }
      if (malformed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shares"],
          message: `Each share must be a plain number with at most ${decimals} decimal places`,
        });
      } else if (sumUnits !== totalUnits) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shares"],
          message: `Custom split allocations must sum to the total amount of ${total.normalized} (currently ${unitsToDecimal(sumUnits, decimals)})`,
        });
      }
    }
  });

export type CreateExpenseFormInput = z.infer<typeof createExpenseSchema>;

/**
 * Settlement form validation schema.
 *
 * Same exact-amount rule as an expense: a settlement that does not fit in
 * integer stroops is rejected by the ledger, not by the API.
 */
export const settleBalanceSchema = z.object({
  recipientId: z.string().trim().min(1, "Recipient ID or Public Key is required"),
  amount: z
    .string()
    .trim()
    .min(1, "Amount is required")
    .superRefine((val, ctx) => {
      const result = validateExpenseAmount(val);
      if (!result.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: result.error ?? "Settlement amount must be a positive number",
        });
      }
    }),
  assetCode: z.string().trim().min(1, "Asset code is required"),
  memo: z.string().trim().optional(),
});

export type SettleBalanceFormInput = z.infer<typeof settleBalanceSchema>;

// ---------------------------------------------------------------------------
// Expense creation payload validation (#315)
// ---------------------------------------------------------------------------

/**
 * Classic Stellar asset codes are 3–12 alphanumeric characters (`XLM`,
 * `USDC`, …). Assets issued by a Soroban contract are referenced by their
 * contract ID instead — either the strkey form (`C…`, 56 characters) or the
 * raw hex form (`0x` + 64 hex digits).
 */
export const ASSET_CONTRACT_ID_REGEX = /^(?:C[A-Z2-7]{55}|0x[0-9a-fA-F]{64})$/;

/** Plain 3–12 character classic asset code. */
const CLASSIC_ASSET_CODE_REGEX = /^[A-Za-z0-9]{3,12}$/;

/**
 * Currency / asset code field of an expense payload: a classic asset code
 * or an asset contract ID.
 */
export const assetCodeSchema = z
  .string()
  .trim()
  .min(1, "Currency / asset code is required")
  .refine(
    (value) => CLASSIC_ASSET_CODE_REGEX.test(value) || ASSET_CONTRACT_ID_REGEX.test(value),
    "Currency must be a 3-12 character asset code or a valid asset contract ID"
  );

/**
 * One participant in an expense payload. Mirrors `ExpenseShareInput` from
 * `src/lib/types.ts`: `amount` is required for custom splits and `percent`
 * for percentage splits — each is checked against the total by the
 * `expenseCreationSchema` refinement below.
 */
export const expenseCreationShareSchema = z.object({
  userId: z.string().trim().min(1, "Participant is required"),
  amount: z.string().optional(),
  percent: z.number().optional(),
});

/**
 * Validate a payload amount on integer stroops (1 stroop = 10^-7, so all
 * comparisons are exact integer arithmetic — never float): plain decimal
 * notation only, strictly positive, at most `DEFAULT_ASSET_DECIMALS` (7)
 * decimal places.
 *
 * JS numbers are stringified with their shortest round-trip representation
 * first, so float drift (`0.1 + 0.2 === 0.30000000000000004`) and exponent
 * forms (`1e-7`) are rejected with a descriptive message instead of being
 * silently truncated.
 */
function validatePayloadAmount(value: string | number): AmountValidationResult {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return invalid("Amount must be a finite number");
  }
  return validateExpenseAmount(typeof value === "number" ? String(value) : value);
}

/** Amount field of the payload: string or number in, decimal string out. */
const payloadAmountSchema = z
  .union([
    z.string(),
    // Deliberately accepts *any* number — `z.number()` rejects NaN at the
    // type layer, before refinements run, which would replace our
    // descriptive message with a generic parse error. Non-finite values
    // are reported by the refinement below instead.
    z.custom<number>((value) => typeof value === "number"),
  ])
  .superRefine((value, ctx) => {
    const result = validatePayloadAmount(value);
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.error ?? "Amount is invalid",
      });
    }
  })
  .transform((value) => validatePayloadAmount(value).normalized ?? "");

/**
 * Runtime validation for group expense creation payloads (#315).
 *
 * Catches malformed amounts, invalid asset codes, and splits that do not
 * add up *before* a request is dispatched to mergepay-api:
 *
 * - `description`, when provided, must be a non-empty string;
 * - `amount` must be > 0 with at most 7 decimal places (Stellar precision),
 *   decided on integer stroops (1e7) so no float drift can slip through;
 * - `assetCode` must be a 3–12 character asset code or an asset contract ID;
 * - participant shares must sum exactly to the total — custom amounts in
 *   stroops, percentages in basis points, and equal splits must give every
 *   participant at least one stroop.
 */
export const expenseCreationSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(MAX_TITLE_LENGTH, `Title must be ${MAX_TITLE_LENGTH} characters or fewer`),
    description: z
      .string()
      .trim()
      .min(1, "Description cannot be empty")
      .max(500, "Description cannot exceed 500 characters")
      .optional(),
    amount: payloadAmountSchema,
    assetCode: assetCodeSchema,
    assetIssuer: z
      .string()
      .trim()
      .regex(STELLAR_PUBLIC_KEY_REGEX, "Asset issuer must be a valid Stellar public key")
      .optional()
      .nullable(),
    splitType: z.enum(["equal", "custom", "percentage"], {
      errorMap: () => ({ message: "Choose how to split this expense" }),
    }),
    shares: z.array(expenseCreationShareSchema).min(1, "At least one participating member is required"),
    payerUserId: z
      .string()
      .trim()
      .optional()
      .refine((value) => value === undefined || value !== "", "Choose who paid"),
    memo: z.string().optional(),
    receiptUrl: z.string().nullable().optional(),
    idempotencyKey: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Field-level checks may already have rejected the payload (a failed
    // field still reaches this refinement with whatever value parsed), so
    // bail out early instead of summing garbage.
    const shares = Array.isArray(data.shares) ? data.shares : [];
    if (shares.length === 0) return;

    // A repeated user id would be double-counted by the sum checks below.
    const seen = new Set<string>();
    for (const share of shares) {
      if (seen.has(share.userId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shares"],
          message: "A participant is selected more than once",
        });
        break;
      }
      seen.add(share.userId);
    }

    // `amount` passed its own field checks, so this conversion is exact —
    // every comparison below runs on integer stroops (1e7 per whole unit),
    // never on floats.
    const totalUnits = parseDecimalUnits(String(data.amount), AMOUNT_DECIMAL_PLACES);
    if (typeof totalUnits !== "bigint" || totalUnits <= 0n) return;

    if (data.splitType === "custom") {
      let sum = 0n;
      shares.forEach((share, index) => {
        const value = share.amount?.trim() ?? "";
        if (value === "") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares", index, "amount"],
            message: "Enter an amount for every participant",
          });
          return;
        }
        const units = parseDecimalUnits(value, AMOUNT_DECIMAL_PLACES);
        if (units === "too_precise") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares", index, "amount"],
            message: `Each share can have at most ${AMOUNT_DECIMAL_PLACES} decimal places`,
          });
          return;
        }
        if (units === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares", index, "amount"],
            message: "Each share must be a plain number",
          });
          return;
        }
        if (units <= 0n) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares", index, "amount"],
            message: "Each share must be greater than zero",
          });
          return;
        }
        sum += units;
      });

      if (sum !== totalUnits) {
        const difference = sum - totalUnits;
        const target = formatAmountUnits(totalUnits);
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
      // Percentages are summed in basis points (integers), so 33.33 + 33.33
      // + 33.34 is exactly 100.00 rather than 99.99999999999999.
      let percentTotalBp = 0n;
      shares.forEach((share, index) => {
        const percent = share.percent;
        if (percent === undefined || Number.isNaN(percent)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares", index, "percent"],
            message: "Enter a percentage for every participant",
          });
          return;
        }
        if (percent < 0 || percent > 100) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares", index, "percent"],
            message: "Percentage must be between 0 and 100",
          });
          return;
        }
        if (Math.abs(percent * 100 - Math.round(percent * 100)) > 1e-9) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares", index, "percent"],
            message: "Percentages must have at most 2 decimal places",
          });
          return;
        }
        percentTotalBp += BigInt(Math.round(percent * 100));
      });

      const oneHundredPercentBp = 100n * 10n ** BigInt(PERCENT_DECIMAL_PLACES);
      if (percentTotalBp !== oneHundredPercentBp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shares"],
          message: `Percentages add up to ${formatDecimalUnits(
            percentTotalBp,
            PERCENT_DECIMAL_PLACES
          )}% — they must add up to 100%`,
        });
      }
      return;
    }

    // Equal splits are derived from the total, so they always sum to it —
    // but only while every participant can receive at least one stroop.
    if (data.splitType === "equal" && totalUnits < BigInt(shares.length)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: `Amount is too small to split between ${shares.length} people`,
      });
    }
  });

/** Parsed output of {@link expenseCreationSchema} — a dispatch-ready payload. */
export type ExpenseCreationInput = z.infer<typeof expenseCreationSchema>;

/**
 * Compile-time assertion (#315): every payload parsed by
 * `expenseCreationSchema` is a valid `CreateExpenseRequest` (see
 * `src/lib/types.ts`), so callers can dispatch `parsed.data` straight to
 * `api.createExpense`. If the schema ever drifts from the API contract,
 * this default type argument stops typechecking.
 */
export type AssertExpenseCreationContract<
  T extends CreateExpenseRequest = ExpenseCreationInput,
> = T;
