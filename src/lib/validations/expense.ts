import { z } from "zod";

/**
 * Comprehensive Zod schema for expense creation and split validation.
 * Enforces multi-field sum invariants using .refine()/.superRefine() to prevent rounding errors.
 */
export const expenseShareSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  amount: z.string().optional(),
  percent: z.number().optional(),
});

function parseUnits(value: string): bigint {
  const trimmed = value.trim();
  const [whole, fraction = ""] = trimmed.split(".");
  const padded = fraction.padEnd(7, "0").slice(0, 7);
  return BigInt(whole || "0") * 10_000_000n + BigInt(padded);
}

export const expenseFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(80, "Title must be 80 characters or fewer"),
  description: z.string().nullable().optional(),
  amount: z.string().min(1, "Amount is required").regex(/^\d+(?:\.\d{1,7})?$/, "Amount must be a positive number with at most 7 decimal places"),
  assetCode: z.string().min(1, "Asset code is required"),
  assetIssuer: z.string().nullable().optional(),
  splitType: z.enum(["equal", "custom", "percentage"]),
  shares: z.array(expenseShareSchema).min(1, "At least one participant is required"),
  payerUserId: z.string().optional(),
  memo: z.string().nullable().optional(),
  receiptUrl: z.string().nullable().optional(),
}).superRefine((data, ctx) => {
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

    if (data.splitType === "custom") {
      let sum = 0n;
      for (let i = 0; i < data.shares.length; i++) {
        const share = data.shares[i];
        if (!share.amount || share.amount.trim() === "") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares", i, "amount"],
            message: "Amount is required for custom split",
          });
          continue;
        }
        if (!/^\d+(?:\.\d{1,7})?$/.test(share.amount.trim())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shares", i, "amount"],
            message: "Invalid share amount format",
          });
          continue;
        }
        sum += parseUnits(share.amount);
      }

      if (sum !== totalUnits) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shares"],
          message: "Custom shares sum must match the total expense amount",
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
            message: "Percentage is required",
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
        percentSum += share.percent;
      }

      // Check if percentages add up to 100 (allowing minor floating delta checks)
      const roundedTotal = Math.round(percentSum * 100);
      if (roundedTotal !== 10000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shares"],
          message: "Percentages must add up to exactly 100%",
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
