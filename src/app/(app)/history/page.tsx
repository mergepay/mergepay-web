"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Section } from "../../components/ui/section";
import { HistoryFilterBar } from "../../components/history/HistoryFilterBar";
import { useGroupStore } from "../../lib/group-store";
import { useExpenses, useSettlements } from "../../lib/queries";
import { exportTransactionHistoryCsv } from "../../lib/exportCsv";

export default function HistoryPage() {
  const selectedGroupId = useGroupStore((s) => s.selectedGroupId);
  const { data: expenseData } = useExpenses(selectedGroupId ?? undefined);
  const { data: settlementData } = useSettlements(selectedGroupId ?? undefined);

  const expenses = expenseData?.expenses ?? [];
  const settlements = settlementData?.settlements ?? [];

  const [filters, setFilters] = useState({});

  function handleExport() {
    if (!selectedGroupId) {
      toast.error("Please select a group first");
      return;
    }
    exportTransactionHistoryCsv(expenses, settlements, selectedGroupId);
    toast.success("Transaction history exported to CSV");
  }

  return (
    <Section
      title="Transaction History"
      description="View and export all expenses and settlements across your group."
      action={
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!selectedGroupId}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      }
    >
      <div className="space-y-4">
        <HistoryFilterBar filters={filters} onChange={setFilters} />
        <div className="rounded-2xl border-3 border-ink bg-paper p-6 shadow-hard">
          <p className="text-sm text-ink/70">
            {expenses.length} expenses and {settlements.length} settlements recorded.
          </p>
        </div>
      </div>
    </Section>
  );
}
