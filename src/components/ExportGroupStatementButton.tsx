"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, FieldHint } from "@/components/ui/input";
import {
  buildGroupStatementCsv,
  generateGroupStatementFilename,
  downloadStatementCsv,
} from "@/lib/csvStatement";
import type { Expense, Settlement } from "@/lib/types";

/**
 * Export button that generates a comprehensive CSV statement of a group's
 * expenses and settlements.
 *
 * Opens a dialog with optional date-range filtering. The CSV is built
 * entirely client-side — no data is sent to the server. Styled as a
 * neobrutalist action button consistent with other toolbar buttons in
 * the dashboard.
 *
 * @example
 * ```tsx
 * <ExportGroupStatementButton
 *   groupId={groupId}
 *   expenses={expenses}
 *   settlements={settlements}
 * />
 * ```
 */
export function ExportGroupStatementButton({
  groupId,
  expenses,
  settlements,
}: {
  groupId: string;
  expenses: Expense[];
  settlements: Settlement[];
}) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const hasData = expenses.length > 0 || settlements.length > 0;

  function handleExport() {
    const csv = buildGroupStatementCsv(expenses, settlements, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    // Count rows (minus header) so we can tell the user what was exported.
    const rowCount = csv.split("\n").length - 1;
    if (rowCount === 0) {
      toast.error("No records match the selected date range");
      return;
    }

    const filename = generateGroupStatementFilename(groupId);
    downloadStatementCsv(csv, filename);

    setOpen(false);
    toast.success(
      `Exported ${rowCount} record${rowCount === 1 ? "" : "s"} as CSV`
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!hasData}
        title={
          hasData
            ? undefined
            : "No expenses or settlements to export yet"
        }
      >
        <Download className="h-4 w-4" /> Export CSV
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Export group statement"
        description="Download a CSV of this group's expenses and settlements."
      >
        <div className="space-y-4">
          <p className="text-sm text-ink/60">
            The CSV includes one row per expense share and one row per
            settlement, with dates, amounts, participants, and
            settlement status. The file is built locally in your
            browser — nothing is sent to the server.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="stmt-start">Start date</Label>
              <Input
                id="stmt-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="stmt-end">End date</Label>
              <Input
                id="stmt-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <FieldHint>
            Leave the date fields blank to export the full history.
          </FieldHint>

          <div className="rounded-lg border-2 border-ink bg-cream/40 p-3 text-xs">
            <p className="font-bold">
              Records:{" "}
              <span className="font-mono text-grape">
                {expenses.length} expense{expenses.length === 1 ? "" : "s"}
              </span>{" "}
              +{" "}
              <span className="font-mono text-grape">
                {settlements.length} settlement
                {settlements.length === 1 ? "" : "s"}
              </span>
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={!hasData}>
              <Download className="h-4 w-4" /> Download CSV
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
