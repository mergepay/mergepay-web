"use client";

import { useState } from "react";
import { Download, FileJson, FileSpreadsheet, Printer } from "lucide-react";
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

  const [format, setFormat] = useState<"csv" | "json" | "print">("csv");
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

    if (format === "print") {
      handlePrintSummary();
      return;
    }

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

  function handlePrintSummary() {
    const rows = filteredExpenses
      .map(
        (e) => `
        <tr>
          <td>${escapeForPrint(e.createdAt.slice(0, 10))}</td>
          <td>${escapeForPrint(e.title)}</td>
          <td>${escapeForPrint(e.payer.displayName)}</td>
          <td style="text-align:right">${e.amount} ${e.assetCode}</td>
          <td>${e.splitType}</td>
        </tr>`
      )
      .join("");

    const total = filteredExpenses.reduce(
      (sum, e) => sum + Number(e.amount),
      0
    );

    const html = `<!doctype html><html><head><meta charset="utf-8"/>
    <title>Mergepay Expense Report</title>
    <style>
      body{font-family:ui-monospace,Menlo,monospace;background:#FBF3E2;color:#18130E;padding:40px;}
      .card{border:3px solid #18130E;border-radius:18px;background:#FFF9EC;padding:28px;box-shadow:6px 6px 0 #18130E;max-width:800px;margin:auto;}
      h1{font-size:22px;letter-spacing:.05em;text-transform:uppercase;margin:0 0 4px;}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-top:16px;}
      th{text-align:left;border-bottom:2px solid #18130E;padding:6px 8px;font-size:10px;text-transform:uppercase;}
      td{padding:6px 8px;border-bottom:1px dashed #18130E55;}
      .total{font-size:18px;font-weight:700;margin-top:16px;text-align:right;}
      .tag{display:inline-block;background:#D7F94B;border:2px solid #18130E;border-radius:8px;padding:2px 8px;font-size:10px;text-transform:uppercase;}
      @media print{body{padding:20px;}.card{box-shadow:none;}}
    </style></head><body>
    <div class="card">
      <span class="tag">Mergepay</span>
      <h1>Expense Report</h1>
      <p style="font-size:12px;color:#6b7280">${filteredExpenses.length} expense(s) · ${new Date().toLocaleDateString()}</p>
      <table>
        <thead><tr>
          <th>Date</th><th>Description</th><th>Payer</th><th style="text-align:right">Amount</th><th>Split</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total">Total: ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 })} XLM</div>
    </div>
    <script>window.onload=()=>window.print()</script>
    </body></html>`;

    const w = window.open("", "_blank", "width=850,height=700");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    onClose();
  }

  function escapeForPrint(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setFormat("csv")}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 border-ink p-2 text-xs font-bold uppercase tracking-wider transition-all ${
                format === "csv" ? "bg-grape text-paper shadow-hard-sm" : "bg-paper hover:bg-cream"
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" /> CSV
            </button>
            <button
              type="button"
              onClick={() => setFormat("json")}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 border-ink p-2 text-xs font-bold uppercase tracking-wider transition-all ${
                format === "json" ? "bg-grape text-paper shadow-hard-sm" : "bg-paper hover:bg-cream"
              }`}
            >
              <FileJson className="h-4 w-4" /> JSON
            </button>
            <button
              type="button"
              onClick={() => setFormat("print")}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 border-ink p-2 text-xs font-bold uppercase tracking-wider transition-all ${
                format === "print" ? "bg-grape text-paper shadow-hard-sm" : "bg-paper hover:bg-cream"
              }`}
            >
              <Printer className="h-4 w-4" /> Print
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