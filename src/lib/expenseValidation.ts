import { z } from "zod";

const MAX_DECIMALS = 7;

const amountSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .refine(
    (val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) return false;
      const dot = val.indexOf(".");
      if (dot !== -1 && val.slice(dot + 1).length > MAX_DECIMALS) return false;
      return true;
    },
    { message: `Amount must be positive with at most ${MAX_DECIMALS} decimal places` }
  );

export const expenseFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(80, "Title must be 80 characters or fewer"),
    amount: amountSchema,
    splitType: z.enum(["equal", "custom", "percentage"]),
    participants: z.array(z.string()).min(1, "Select at least one participant"),
    custom: z.record(z.string(), z.string()).default({}),
    percent: z.record(z.string(), z.string()).default({}),
  })
  .superRefine((data, ctx) => {
    const total = parseFloat(data.amount) || 0;

    if (data.splitType === "custom") {
      const sum = data.participants.reduce(
        (s, id) => s + (parseFloat(data.custom[id] || "0") || 0),
        0
      );
      if (Math.abs(sum - total) > 0.0000001) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Custom amounts must sum to ${total.toFixed(2)}`,
          path: ["custom"],
        });
      }
    }

    if (data.splitType === "percentage") {
      const sum = data.participants.reduce(
        (s, id) => s + (parseFloat(data.percent[id] || "0") || 0),
        0
      );
      if (Math.abs(sum - 100) > 0.001) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Percentages must sum to 100",
          path: ["percent"],
        });
      }
    }
  });

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export type FormErrors = Partial<Record<string, string>>;

export function validateExpenseForm(data: {
  title: string;
  amount: string;
  splitType: string;
  participants: string[];
  custom: Record<string, string>;
  percent: Record<string, string>;
}): FormErrors | null {
  const result = expenseFormSchema.safeParse(data);
  if (result.success) return null;

  const errors: FormErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !errors[key]) {
      errors[key] = issue.message;
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}
