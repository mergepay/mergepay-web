"use client";

import { Download, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Expense, Settlement } from "@/lib/types";
import { buildHistoryCsv, buildAuditDetails } from "@/lib/exportUtils";

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function GroupExportButton({ expenses, settlements }: { expenses: Expense[]; settlements: Settlement[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => download("mergepay-history.csv", buildHistoryCsv(expenses, settlements), "text/csv;charset=utf-8")}>
        <Download className="h-4 w-4" /> Export CSV
      </Button>
      <Button variant="outline" onClick={() => download(`mergepay-history-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ expenses, settlements }, null, 2), "application/json")}>
        <FileJson className="h-4 w-4" /> Export JSON
      </Button>
    </div>
  );
}

export function AuditDetails({ settlement }: { settlement: Settlement }) {
  if (!settlement.stellarTxHash && !settlement.memo) return null;
  const audit = buildAuditDetails(settlement);
  return (
    <details className="mt-3 w-full border-t-2 border-ink/10 pt-3 text-xs">
      <summary className="cursor-pointer font-bold">View audit details</summary>
      <dl className="mt-2 grid gap-1 sm:grid-cols-2">
        <div><dt className="font-bold">Stellar hash</dt><dd className="break-all font-mono">{audit.explorerUrl ? <a className="underline" href={audit.explorerUrl} target="_blank" rel="noopener noreferrer">{audit.stellarTxHash}</a> : "Not submitted"}</dd></div>
        <div><dt className="font-bold">Payment memo</dt><dd className="font-mono">{settlement.memo ?? "None"}</dd></div>
        <div><dt className="font-bold">Settlement ID</dt><dd className="break-all font-mono">{audit.settlementId}</dd></div>
        <div><dt className="font-bold">Network</dt><dd>{audit.network}</dd></div>
      </dl>
    </details>
  );
}
