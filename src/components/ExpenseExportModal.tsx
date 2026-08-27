"use client";

import { useState } from "react";
import { Download, FileJson, FileSpreadsheet } from "lucide-react";
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
import { buildFilteredExpenseExportJson } from "@/lib/export";

export interface ExpenseExportModalProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  currentUserId: string;
  expenses?: Expense[];
}

export function ExpenseExportModal({
  open,
  onClose,
  groupId,
  currentUserId,
  expenses: propExpenses,
}: ExpenseExportModalProps) {
  const { data } = useExpenses(groupId);
  const expenses = propExpenses ?? data?.expenses ?? [];

  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [status, setStatus] = useState<ExportStatusFilter>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filteredExpenses = expenses.filter((e) => {
    const date = e.createdAt.slice(0, 10);
    if (startDate && date < startDate) return false;
    if (endDate && date > endDate) return false;
    if (status !== "all") {
      const share = e.shares.find((s) => s.userId === currentUserId);
      const isSettled = share?.status === "settled";
      if (status === "settled" && !isSettled) return false;
      if (status === "unsettled" && isSettled) return false;
    }
    return true;
  });

  function handleExport() {
    if (filteredExpenses.length === 0) {
      toast.error("No expenses match the selected filters");
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    let content: string;
    let mimeType: string;
    let filename: string;

    if (format === "csv") {
      content = buildExpenseExportCsv(filteredExpenses, currentUserId, {
        status,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      mimeType = "text/csv;charset=utf-8";
      filename = `mergepay-export-${groupId}-${timestamp}.csv`;
    } else {
      content = buildFilteredExpenseExportJson(filteredExpenses, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      mimeType = "application/json;charset=utf-8";
      filename = `mergepay-export-${groupId}-${timestamp}.json`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onClose();
    toast.success(`Exported ${filteredExpenses.length} expense(s) as ${format.toUpperCase()}`);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export Expenses"
      description="Download your group's expense records in CSV or JSON format."
    >
      <div className="space-y-4 pt-2">
        <div className="space-y-1">
          <Label htmlFor="export-format">Export Format</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormat("csv")}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 border-ink p-2 text-xs font-bold uppercase tracking-wider transition-all ${
                format === "csv" ? "bg-grape text-paper shadow-hard-sm" : "bg-paper hover:bg-cream"
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" /> CSV Format
            </button>
            <button
              type="button"
              onClick={() => setFormat("json")}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 border-ink p-2 text-xs font-bold uppercase tracking-wider transition-all ${
                format === "json" ? "bg-grape text-paper shadow-hard-sm" : "bg-paper hover:bg-cream"
              }`}
            >
              <FileJson className="h-4 w-4" /> JSON Format
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="export-start-date">Start Date</Label>
            <Input
              id="export-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="export-end-date">End Date</Label>
            <Input
              id="export-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="export-status">Settlement Status</Label>
          <Select
            id="export-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ExportStatusFilter)}
          >
            <option value="all">All expenses</option>
            <option value="settled">Settled only</option>
            <option value="unsettled">Unsettled only</option>
          </Select>
          <FieldHint>Filter records by settlement progress</FieldHint>
        </div>

        <div className="rounded-lg border-2 border-ink bg-cream/40 p-3 text-xs">
          <p className="font-bold">
            Matching records: <span className="font-mono text-grape">{filteredExpenses.length}</span> / {expenses.length}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={filteredExpenses.length === 0}>
            <Download className="h-4 w-4" /> Export {format.toUpperCase()}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}