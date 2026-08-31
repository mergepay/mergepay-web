"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, FieldHint } from "@/components/ui/input";
import { useExpenses } from "@/lib/queries";
import {
  buildExpenseExportCsv,
  buildExportFilename,
  type ExportStatusFilter,
} from "@/lib/utils";
import type { Expense } from "@/lib/types";
import { exportExpenseJson } from "@/lib/export";

/**
 * Triggers a local, client-side export of a group's expense history to CSV.
 *
 * The user narrows the export with a date range (Start / End) and a status
 * filter (Settled / Unsettled / All) before the file is generated. The CSV is
 * built entirely in the browser (`src/lib/utils.ts`) so the group's expense
 * data never leaves the client — no API load, and no need to transmit raw
 * payer addresses anywhere but the downloaded file.
 */
export function ExportHistoryButton({
  groupId,
  currentUserId,
}: {
  groupId: string;
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useExpenses(groupId);

  const [status, setStatus] = useState<ExportStatusFilter>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const expenses: Expense[] = data?.expenses ?? [];

  function handleExport() {
    const csv = buildExpenseExportCsv(expenses, currentUserId, {
      status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    const filename = buildExportFilename(groupId);

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    setOpen(false);
    toast.success("Expense history exported");
  }

  const hasExpenses = expenses.length > 0;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4" /> Export
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Export expenses"
        description="Choose a date range and status filter, then download your expense history as a CSV."
      >
        <div className="space-y-4">
          <p className="text-sm text-ink/60">
            Export this group&apos;s expense history as a CSV. The file is built
            locally in your browser — nothing is sent to the server.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="export-start">Start date</Label>
              <Input
                id="export-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="export-end">End date</Label>
              <Input
                id="export-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="export-status">Status</Label>
            <Select
              id="export-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ExportStatusFilter)}
            >
              <option value="all">All</option>
              <option value="settled">Settled</option>
              <option value="unsettled">Unsettled</option>
            </Select>
          </div>

          <FieldHint>
            Leave the date fields blank to export the full history.
          </FieldHint>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => exportExpenseJson(expenses, `mergepay-${groupId}.json`)}
              loading={isLoading}
              disabled={!hasExpenses}
            >JSON</Button>
            <Button
              onClick={handleExport}
              loading={isLoading}
              disabled={!hasExpenses}
              title={
                hasExpenses
                  ? undefined
                  : "There are no expenses to export yet"
              }
            >
              <Download className="h-4 w-4" /> Download CSV
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
