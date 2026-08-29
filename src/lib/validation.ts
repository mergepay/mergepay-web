/**
 * Validation schemas and helpers for client forms and server API routes.
 *
 * Kept free of React/Next.js imports so it can be used from route handlers,
 * client components, and unit tests alike.
 */

import { z } from "zod";

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
 */
export const expenseShareInputSchema = z.object({
  userId: z.string().trim().min(1, "Member ID is required"),
  amount: z
    .string()
    .optional()
    .refine((val) => val === undefined || (Boolean(val.trim()) && !isNaN(Number(val)) && Number(val) >= 0), {
      message: "Amount must be a non-negative number",
    }),
  percent: z
    .number()
    .optional()
    .refine((val) => val === undefined || (val >= 0 && val <= 100), {
      message: "Percentage must be between 0 and 100",
    }),
});

/**
 * Expense creation form validation schema.
 */
export const createExpenseSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(120, "Title cannot exceed 120 characters"),
    description: z.string().trim().optional(),
    amount: z
      .string()
      .trim()
      .min(1, "Amount is required")
      .refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Amount must be a positive number"),
    assetCode: z.string().trim().min(1, "Asset code is required"),
    payerUserId: z.string().trim().min(1, "Payer member is required"),
    splitType: z.enum(["equal", "custom", "percentage"]),
    shares: z.array(expenseShareInputSchema).min(1, "At least one participating member is required"),
    memo: z.string().trim().optional(),
    receiptUrl: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const total = Number(data.amount);
    if (isNaN(total) || total <= 0) return;

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
      const sumCustom = data.shares.reduce((acc, s) => acc + Number(s.amount ?? 0), 0);
      if (Math.abs(sumCustom - total) > 0.0001) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shares"],
          message: `Custom split allocations must sum to the total amount of ${data.amount} (currently ${sumCustom.toFixed(2)})`,
        });
      }
    }
  });

export type CreateExpenseFormInput = z.infer<typeof createExpenseSchema>;

/**
 * Settlement form validation schema.
 */
export const settleBalanceSchema = z.object({
  recipientId: z.string().trim().min(1, "Recipient ID or Public Key is required"),
  amount: z
    .string()
    .trim()
    .min(1, "Amount is required")
    .refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Settlement amount must be a positive number"),
  assetCode: z.string().trim().min(1, "Asset code is required"),
  memo: z.string().trim().optional(),
});

export type SettleBalanceFormInput = z.infer<typeof settleBalanceSchema>;
