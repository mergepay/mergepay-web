"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExpenses } from "@/lib/queries";
import type { Expense } from "@/lib/types";
import { ExpenseExportModal } from "@/components/ExpenseExportModal";

export function ExportHistoryButton({
  groupId,
  currentUserId,
}: {
  groupId: string;
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const { data } = useExpenses(groupId);
  const expenses: Expense[] = data?.expenses ?? [];

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4" /> Export History
      </Button>

      <ExpenseExportModal
        open={open}
        onClose={() => setOpen(false)}
        groupId={groupId}
        currentUserId={currentUserId}
        expenses={expenses}
      />
    </>
  );
}