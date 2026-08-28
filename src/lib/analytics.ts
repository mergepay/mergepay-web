import type { Expense } from "./types";

export interface ExpenseCategoryTotal {
  category: string;
  amount: string;
  percentage: number;
  count: number;
}

const CATEGORY_RULES: Array<[string, RegExp]> = [
  ["Rent", /rent|lease|housing/i],
  ["Food", /food|grocer|restaurant|meal|lunch|dinner/i],
  ["Utilities", /utilit|electric|water|internet|power|bill/i],
  ["Transport", /transport|fuel|taxi|uber|bus|train/i],
];

export function categorizeExpense(expense: Pick<Expense, "title" | "description">): string {
  const text = `${expense.title} ${expense.description ?? ""}`;
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? "Other";
}

export function summarizeCategories(expenses: Expense[]): ExpenseCategoryTotal[] {
  const totals = new Map<string, { amount: bigint; count: number }>();
  let total = 0n;
  for (const expense of expenses) {
    const amount = toUnits(expense.amount);
    total += amount;
    const category = categorizeExpense(expense);
    const current = totals.get(category) ?? { amount: 0n, count: 0 };
    totals.set(category, { amount: current.amount + amount, count: current.count + 1 });
  }
  return [...totals.entries()]
    .sort((a, b) => (b[1].amount > a[1].amount ? 1 : -1))
    .map(([category, value]) => ({
      category,
      amount: fromUnits(value.amount),
      percentage: total === 0n ? 0 : Number((value.amount * 10000n) / total) / 100,
      count: value.count,
    }));
}

function toUnits(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0").slice(0, 7));
}

function fromUnits(value: bigint): string {
  const whole = value / 10_000_000n;
  const fraction = (value % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}
