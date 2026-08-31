"use client";

import { Card, CardContent } from "../ui/card";
import { Money } from "../amount";
import type { Expense } from "@/lib/types";
import { formatCurrencyAmount } from "@/lib/format";

export interface ExpenseListProps {
  expenses: Expense[];
  className?: string;
}

export function ExpenseList({ expenses, className = "" }: ExpenseListProps) {
  if (!expenses || expenses.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center text-ink/60 text-sm">
          No expenses recorded yet.
        </CardContent>
      </Card> 
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {expenses.map((expense) => (
        <Card key={expense.id}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-bold text-sm text-ink">{expense.title}</p>
              <p className="text-xs text-ink/60">
                {new Date(expense.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="font-mono font-bold text-right">
              <Money value={expense.amount} assetCode={expense.assetCode} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
