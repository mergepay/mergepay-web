"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Money } from "@/components/amount";
import type { Expense } from "@/lib/types";
import { summarizeCategories } from "@/lib/analytics";

function units(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
}
function decimal(value: bigint): string {
  const whole = value / 10_000_000n;
  const fraction = (value % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

export function GroupAnalytics({ expenses }: { expenses: Expense[] }) {
  const total = useMemo(() => expenses.reduce((sum, e) => sum + units(e.amount), 0n), [expenses]);
  const average = expenses.length ? total / BigInt(expenses.length) : 0n;
  const assetCode = expenses[0]?.assetCode ?? "XLM";
  const largest = expenses.slice().sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5);
  const categories = summarizeCategories(expenses);
  return <Card className="mb-4">
    <div className="border-b-3 border-ink bg-aqua px-4 py-3"><h2 className="font-display text-sm uppercase tracking-widest">Analytics &amp; export</h2></div>
    <CardContent className="space-y-4 pt-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div><p className="text-[10px] uppercase tracking-widest text-ink/50">Total spent</p><Money value={decimal(total)} assetCode={assetCode} /></div>
        <div><p className="text-[10px] uppercase tracking-widest text-ink/50">Average</p><Money value={decimal(average)} assetCode={assetCode} /></div>
        <div><p className="text-[10px] uppercase tracking-widest text-ink/50">Expenses</p><p className="font-mono text-xl font-bold">{expenses.length}</p></div>
      </div>
      {largest.length > 0 && <div className="space-y-2" aria-label="Largest expenses">{largest.map((e) => {
        const ratio = total ? Number((units(e.amount) * 10000n) / total) / 100 : 0;
        return <div key={e.id}><div className="flex justify-between text-xs"><span className="truncate">{e.title}</span><span className="font-mono">{ratio.toFixed(0)}%</span></div><div className="mt-1 h-3 border-2 border-ink bg-paper"><div className="h-full bg-grape" style={{ width: `${Math.min(100, ratio)}%` }} /></div></div>;
      })}</div>}
      {categories.length > 0 && <div className="space-y-2" aria-label="Spending by category">
        {categories.map((category) => <div key={category.category}>
          <div className="flex justify-between text-xs"><span>{category.category}</span><span className="font-mono">{category.percentage.toFixed(0)}%</span></div>
          <div className="mt-1 h-3 border-2 border-ink bg-paper"><div className="h-full bg-aqua" style={{ width: `${category.percentage}%` }} /></div>
        </div>)}
      </div>}
    </CardContent>
  </Card>;
}
