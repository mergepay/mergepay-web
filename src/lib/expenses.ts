import type { Expense } from "./types";

export function sortExpensesByDateDesc(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();

    return bTime - aTime;
  });
}
