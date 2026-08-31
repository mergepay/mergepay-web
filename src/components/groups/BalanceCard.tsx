"use client";

import { Card, CardContent } from "../ui/card";
import { Money } from "../amount";
import { formatCurrencyAmount } from "@/lib/format";

export interface BalanceCardProps {
  amount: string | number | null | undefined;
  assetCode?: string | null;
  label?: string;
  className?: string;
}

export function BalanceCard({
  amount,
  assetCode = "XLM",
  label = "Balance",
  className = "",
}: BalanceCardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-4 space-y-1">
        <p className="text-[10px] uppercase tracking-widest text-ink/50">{label}</p>
        <div className="font-mono text-2xl font-bold">
          <Money value={amount} assetCode={assetCode} />
        </div>
      </CardContent>
    </Card>
  );
}
