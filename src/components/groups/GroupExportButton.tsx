"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import {
  buildExpenseExportJson,
  buildHistoryCsv,
} from "../../lib/export";
import type { Expense, Settlement } from "../../lib/types";

export function GroupExportButton({
  groupId,
  expenses,
  settlements,
}: {
  groupId: string;
  expenses: Expense[];
  settlements: Settlement[];
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"csv" | "json">("csv");

  const hasData = expenses.length > 0 || settlements.length > 0;

  function handleExport() {
    if (format === "csv") {
      const csv = buildHistoryCsv(expenses, settlements);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mergepay-group-${groupId}-statement.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Group statement exported as CSV");
    } else {
      const json = buildExpenseExportJson(expenses);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mergepay-group-${groupId}-statement.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Group statement exported as JSON");
    }
    setOpen(false);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!hasData}
        className="border-3 border-ink shadow-brutal bg-paper hover:bg-aqua transition-all"
      >
        <Download className="h-4 w-4 mr-1.5" /> Export Group
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Export Group Data"
        description="Download your group transaction and settlement history."
      >
        <div className="space-y-4">
          <p className="text-sm text-ink/70">
            Choose your preferred export format. The file is generated securely in your browser.
          </p>
          <div className="flex gap-3">
            <Button
              variant={format === "csv" ? "primary" : "outline"}
              onClick={() => setFormat("csv")}
              className="flex-1"
            >
              CSV Format
            </Button>
            <Button
              variant={format === "json" ? "primary" : "outline"}
              onClick={() => setFormat("json")}
              className="flex-1"
            >
              JSON Format
            </Button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={!hasData}>
              Download {format.toUpperCase()}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
