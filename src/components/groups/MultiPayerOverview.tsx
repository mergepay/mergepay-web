import { Card, CardContent } from "@/components/ui/card";
import { Money } from "@/components/amount";
import type { Expense } from "@/lib/types";

interface PayerSummary {
  payerUserId: string;
  payerName: string;
  expenseCount: number;
  totals: Map<string, number>;
}

export function MultiPayerOverview({ expenses }: { expenses: Expense[] }) {
  const payers = new Map<string, PayerSummary>();

  for (const expense of expenses) {
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount)) continue;

    let payer = payers.get(expense.payerUserId);
    if (!payer) {
      payer = {
        payerUserId: expense.payerUserId,
        payerName: expense.payer.displayName,
        expenseCount: 0,
        totals: new Map(),
      };
      payers.set(expense.payerUserId, payer);
    }

    payer.expenseCount += 1;
    payer.totals.set(
      expense.assetCode,
      (payer.totals.get(expense.assetCode) ?? 0) + amount
    );
  }

  const summaries = [...payers.values()].sort(
    (a, b) => b.expenseCount - a.expenseCount || a.payerName.localeCompare(b.payerName)
  );

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xs uppercase tracking-widest text-ink/60">
            Multi-payer overview
          </h3>
          <span className="text-xs text-ink/50">
            {summaries.length} {summaries.length === 1 ? "payer" : "payers"}
          </span>
        </div>
        {summaries.length === 0 ? (
          <p className="text-sm text-ink/50">No expenses to summarize yet.</p>
        ) : (
          <ul className="space-y-2">
            {summaries.map((payer) => (
              <li
                key={payer.payerUserId}
                className="rounded-lg border-2 border-ink/20 bg-cream/50 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold">{payer.payerName}</span>
                  <span className="shrink-0 text-xs text-ink/50">
                    {payer.expenseCount} {payer.expenseCount === 1 ? "expense" : "expenses"}
                  </span>
                </div>
                <ul className="mt-1 space-y-1">
                  {[...payer.totals.entries()]
                    .sort(([assetA], [assetB]) => assetA.localeCompare(assetB))
                    .map(([assetCode, total]) => (
                      <li key={assetCode} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-ink/60">{assetCode} paid</span>
                        <Money value={total.toFixed(7)} assetCode={assetCode} />
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}