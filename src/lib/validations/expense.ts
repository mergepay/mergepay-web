import { z } from "zod";

/**
 * Comprehensive Zod schema for expense creation and split validation.
 * Enforces multi-field sum invariants using .refine()/.superRefine() to prevent rounding errors.
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
    description: z.string().nullable().optional(),
    amount: z
      .string()
      .min(1, "Amount is required")
      .regex(/^\d+(?:\.\d{1,7})?$/, `${PLAIN_NUMBER} with at most 7 decimal places`),
    assetCode: z.string().min(1, "Asset code is required"),
    assetIssuer: z.string().nullable().optional(),
    splitType: z.enum(["equal", "custom", "percentage"], {
      errorMap: () => ({ message: "Choose how to split this expense" }),
    }),
    shares: z.array(expenseShareSchema).min(1, "Select at least one participant"),
    payerUserId: z
      .string()
      .optional()
      .refine((value) => value === undefined || value.trim() !== "", "Choose who paid"),
    memo: z
      .string()
      .max(28, "Memo must be 28 characters or fewer")
      .regex(/^[^\u0000-\u001f\u007f]*$/, "Memo must not contain control characters")
      .nullable()
      .optional(),
    receiptUrl: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
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
        let percentSum = 0;
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
          percentSum += share.percent;
        }

        // Check if percentages add up to 100 (allowing minor floating delta checks)
        const roundedTotal = Math.round(percentSum * 100);
        if (roundedTotal !== 10000) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares"],
            message: `Percentages add up to ${percentSum}% — they must add up to 100%`,
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
