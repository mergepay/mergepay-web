import { z } from "zod";

import { SETTLEMENT_ASSETS } from "../constants";
import { isValidEd25519PublicKey } from "../strkey";
import { MAX_STROOPS } from "../validation";
import { mergepayMemoSchema } from "./memo";
import {
  FULL_PERCENT_BP,
  calculateSplit,
  formatBasisPoints,
  parseAmountStroops,
  parsePercentBasisPoints,
  type SplitCalculation,
} from "../split";

/**
 * Comprehensive Zod schema for expense creation and split validation.
 * Enforces multi-field sum invariants using .refine()/.superRefine() to prevent rounding errors.
 *
 * Rules mirror the `CreateExpenseRequest` contract in `src/lib/types.ts`:
 * decimal-string amounts, Stellar asset codes, an optional issuer public
 * key, and a non-empty participant array.
 */
export const expenseShareSchema = z.object({
  userId: z.string().trim().min(1, "Participant is required"),
  amount: z.string().optional(),
  percent: z.number().optional(),
});

/** Parse a Stellar 7-decimal amount string into stroop units (bigint). */
function parseUnits(value: string): bigint {
  const trimmed = value.trim();
  const [whole, fraction = ""] = trimmed.split(".");
  const padded = fraction.padEnd(7, "0").slice(0, 7);
  return BigInt(whole || "0") * 10_000_000n + BigInt(padded);
}

/** Render stroop units back to a plain decimal string (trailing zeros dropped). */
function unitsToDecimal(units: bigint): string {
  const sign = units < 0n ? "-" : "";
  const abs = units < 0n ? -units : units;
  const whole = abs / 10_000_000n;
  const frac = (abs % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return frac ? `${sign}${whole}.${frac}` : `${sign}${whole}`;
}

/** Plain decimal amount (integer part + optional fraction), no sign/exponent. */
const plainAmount = /^\d+(?:\.\d+)?$/;

/**
 * Stellar asset codes are 1–12 alphanumeric characters (XLM, USDC, …).
 * Anything longer or containing symbols cannot exist on the network.
 */
const ASSET_CODE_PATTERN = /^[A-Za-z0-9]{1,12}$/;

/** Exactly the "plain number" error family the UI copy promises. */
const PLAIN_NUMBER = "Amount must be a plain number";
const MAX_PRECISION = "Amount must have at most 7 decimal places";

export const expenseFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(80, "Title must be 80 characters or fewer"),
    description: z
      .string()
      .trim()
      .min(1, "Description cannot be empty")
      .max(500, "Description must be 500 characters or fewer")
      .regex(/^[^\u0000-\u001f\u007f]*$/, "Description must not contain control characters")
      .optional(),
    amount: z
      .string()
      .min(1, "Amount is required")
      .regex(/^\d+(?:\.\d{1,7})?$/, `${PLAIN_NUMBER} with at most 7 decimal places`) // strict positive decimal with up to 7 decimal places
      .refine((val) => { const num = parseFloat(val); return !isNaN(num) && num > 0; }, "Amount must be greater than zero")
      // The payload gate (`expenseCreationSchema`) rejects anything above the
      // int64 stroop ceiling; enforce it here too so the field is flagged
      // inline instead of failing only after submit.
      .refine(
        // Zod still runs this after the format check fails, so only measure
        // amounts that are well-formed (BigInt throws on "abc").
        (val) => !/^\d+(?:\.\d{1,7})?$/.test(val) || parseUnits(val) <= MAX_STROOPS,
        "Amount exceeds the maximum supported by Stellar"
      ),
    assetCode: z
      .string()
      .trim()
      .min(1, "Asset code is required")
      .regex(ASSET_CODE_PATTERN, "Asset code must be 1-12 letters or digits"),
    assetIssuer: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || isValidEd25519PublicKey(value),
        "Asset issuer must be a valid Stellar public key"
      )
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    splitType: z.enum(["equal", "custom", "percentage"], {
      errorMap: () => ({ message: "Choose how to split this expense" }),
    }),
    shares: z.array(expenseShareSchema).min(1, "Select at least one participant"),
    payerUserId: z
      .string()
      .optional()
      .refine((value) => value === undefined || value.trim() !== "", "Choose who paid"),
    // Optional, but when present it must be a well-formed `MP:<code>` memo.
    // The character cap and the charset both come from `mergepayMemoSchema`,
    // which also enforces the 28-*byte* Stellar limit (characters alone let a
    // multi-byte memo through and get it rejected at submission instead).
    memo: mergepayMemoSchema.nullable().optional(),
    receiptUrl: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    // Reject duplicate participants before summing shares: a repeated user
    // id would otherwise double-count in custom/percentage splits.
    const seen = new Set<string>();
    for (let i = 0; i < data.shares.length; i++) {
      const id = data.shares[i].userId;
      if (seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shares"],
          message: "A participant is selected more than once",
        });
        break;
      }
      seen.add(id);
    }

    // Validate amount > 0
    try {
      const totalUnits = parseUnits(data.amount);
      if (totalUnits <= 0n) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: "Amount must be greater than zero",
        });
        return;
      }

      if (data.splitType === "equal" && totalUnits < BigInt(data.shares.length)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: `Amount is too small to split between ${data.shares.length} people`,
        });
        return;
      }

      if (data.splitType === "custom") {
        let sum = 0n;
        for (let i = 0; i < data.shares.length; i++) {
          const share = data.shares[i];
          const value = share.amount?.trim() ?? "";
          if (value === "") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["shares", i, "amount"],
              message: "Enter an amount for every participant",
            });
            continue;
          }
          if (!plainAmount.test(value)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["shares", i, "amount"],
              message: PLAIN_NUMBER,
            });
            continue;
          }
          const decimals = value.includes(".") ? value.split(".")[1].length : 0;
          if (decimals > 7) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["shares", i, "amount"],
              message: MAX_PRECISION,
            });
            continue;
          }
          const shareUnits = parseUnits(value);
          if (shareUnits <= 0n) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["shares", i, "amount"],
              message: "Share amount must be greater than zero",
            });
            continue;
          }
          sum += shareUnits;
        }

        if (sum !== totalUnits) {
          const diff = sum - totalUnits;
          const over = diff > 0n;
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares"],
            message: over
              ? `Custom shares are over by ${unitsToDecimal(diff)} — they must add up to ${unitsToDecimal(totalUnits)}`
              : `Custom shares are short by ${unitsToDecimal(-diff)} — they must add up to ${unitsToDecimal(totalUnits)}`,
          });
        }
      } else if (data.splitType === "percentage") {
        // Summed in basis points (integers) so 10.1 + 20.2 is exactly 30.30,
        // not 30.299999999999997.
        let percentSumBp = 0;
        for (let i = 0; i < data.shares.length; i++) {
          const share = data.shares[i];
          if (share.percent === undefined || share.percent === null || isNaN(share.percent)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["shares", i, "percent"],
              message: "Enter a percentage for every participant",
            });
            continue;
          }
          if (share.percent < 0 || share.percent > 100) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["shares", i, "percent"],
              message: "Percentage must be between 0 and 100",
            });
            continue;
          }
          if (Math.abs(share.percent * 100 - Math.round(share.percent * 100)) > 1e-9) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["shares", i, "percent"],
              message: "Percentages must have at most 2 decimal places",
            });
            continue;
          }
          percentSumBp += Math.round(share.percent * 100);
        }

        if (percentSumBp !== FULL_PERCENT_BP) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares"],
            message: `Percentages add up to ${formatBasisPoints(percentSumBp)}% — they must add up to 100%`,
          });
        }
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: "Invalid amount format",
      });
    }
  });

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export interface ExpenseFormAsset {
  code: string;
  issuer: string | null;
}

export interface ExpenseFormSchemaOptions {
  /** Current group roster; participant and payer ids must belong to it. */
  memberIds: readonly string[];
  /** Assets this form can submit. Defaults to the app's configured choices. */
  supportedAssets?: readonly ExpenseFormAsset[];
}

/**
 * Apply group and asset configuration checks to the shared expense schema.
 * Asset identity includes the issuer: a syntactically valid code alone does
 * not establish that a custom trustline asset is the one selected by the app.
 */
export function createExpenseFormSchema({
  memberIds,
  supportedAssets = SETTLEMENT_ASSETS,
}: ExpenseFormSchemaOptions) {
  const currentMembers = new Set(memberIds);

  return expenseFormSchema.superRefine((data, ctx) => {
    const selectedAsset = supportedAssets.find(
      (asset) =>
        asset.code === data.assetCode &&
        (asset.issuer ?? null) === (data.assetIssuer ?? null)
    );
    if (!selectedAsset) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [data.assetIssuer ? "assetIssuer" : "assetCode"],
        message: "Choose a supported asset and issuer combination",
      });
    } else {
      const expectedIssuer = selectedAsset.issuer ?? null;
      if (expectedIssuer && !isValidEd25519PublicKey(expectedIssuer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["assetIssuer"],
          message: "The selected asset is missing a valid Stellar issuer",
        });
      }
    }

    if (data.payerUserId && !currentMembers.has(data.payerUserId.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payerUserId"],
        message: "The selected payer is not a member of this group",
      });
    }

    data.shares.forEach((share, index) => {
      if (!currentMembers.has(share.userId.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shares", index, "userId"],
          message: "Selected participant is not a member of this group",
        });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Split calculator form (issue #353)
// ---------------------------------------------------------------------------

/**
 * One participant row in the split calculator. Both inputs are kept as the
 * raw strings the user typed; only the field for the active mode is checked.
 */
export const splitAllocationSchema = z.object({
  userId: z.string().trim().min(1, "Participant is required"),
  amount: z.string(),
  percent: z.string(),
});

/**
 * Validates the split calculator form used by React Hook Form. The expense
 * total is part of the form values so the resolver can compare the rows
 * against it; the sum checks reuse `calculateSplit`, which works in stroops
 * and basis points so no rounding error can slip through.
 */
export const splitCalculatorSchema = z
  .object({
    totalAmount: z.string(),
    mode: z.enum(["equal", "custom", "percentage"]),
    allocations: z.array(splitAllocationSchema).min(1, "Select at least one participant"),
  })
  .superRefine((data, ctx) => {
    const total = parseAmountStroops(data.totalAmount);
    if (total === null || total <= 0n) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalAmount"],
        message: "Enter the expense amount first",
      });
      return;
    }

    if (data.mode === "equal") {
      if (total < BigInt(data.allocations.length)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allocations"],
          message: `Amount is too small to split between ${data.allocations.length} people`,
        });
      }
      return;
    }

    data.allocations.forEach((row, i) => {
      if (data.mode === "custom") {
        const value = row.amount.trim();
        if (value === "") {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allocations", i, "amount"], message: "Enter an amount" });
        } else if (!plainAmount.test(value)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allocations", i, "amount"], message: PLAIN_NUMBER });
        } else if (parseAmountStroops(value) === null) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allocations", i, "amount"], message: MAX_PRECISION });
        }
      } else {
        const value = row.percent.trim();
        if (value === "") {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allocations", i, "percent"], message: "Enter a percentage" });
        } else if (parsePercentBasisPoints(value) === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["allocations", i, "percent"],
            message: "Use 0–100 with at most 2 decimals",
          });
        }
      }
    });

    const calc = calculateSplit(data.mode, data.totalAmount, data.allocations);
    if (calc.balance === "under" || calc.balance === "over") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allocations"],
        message: describeSplitImbalance(calc) ?? "Split does not add up",
      });
    }
  });

export type SplitCalculatorValues = z.infer<typeof splitCalculatorSchema>;

/**
 * Human copy for an unbalanced split, shared by the zod issue and the live
 * warning banner so both always say the same thing. `null` when balanced.
 */
export function describeSplitImbalance(calc: SplitCalculation): string | null {
  if (calc.balance !== "under" && calc.balance !== "over") return null;
  if (calc.mode === "percentage") {
    const sum = calc.percentTotalBp ?? 0;
    const gap = Math.abs(FULL_PERCENT_BP - sum);
    return `Percentages add up to ${formatBasisPoints(sum)}% — ${formatBasisPoints(gap)}% ${
      calc.balance === "under" ? "left to assign" : "too much"
    }. They must total 100%.`;
  }
  const total = calc.totalStroops ?? 0n;
  const gap = calc.remainingStroops < 0n ? -calc.remainingStroops : calc.remainingStroops;
  return `Amounts add up to ${unitsToDecimal(calc.allocatedStroops)} — ${unitsToDecimal(gap)} ${
    calc.balance === "under" ? "left to assign" : "over"
  }. They must total ${unitsToDecimal(total)}.`;
}
