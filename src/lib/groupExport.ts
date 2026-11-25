import type { Expense, Settlement } from "./types";

export interface GroupExportOptions {
  startDate?: string;
  endDate?: string;
}

/**
 * Escapes a CSV field according to RFC 4180.
 * Encloses in double quotes if it contains commas, quotes, or newlines,
 * and escapes internal double quotes by doubling them.
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  if (str.includes(",") || str.includes("\"") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats group expenses and settlements into a structured CSV string.
 */
export function buildGroupExportCsv(
  expenses: Expense[],
  settlements: Settlement[],
  options: GroupExportOptions = {}
): string {
  const { startDate, endDate } = options;

  const filteredExpenses = expenses.filter((e) => {
    const d = e.createdAt.slice(0, 10);
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  });

  const filteredSettlements = settlements.filter((s) => {
    const d = s.createdAt.slice(0, 10);
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  });

  const headers = [
    "Record Type",
    "ID",
    "Date",
    "Title/Memo",
    "Payer / Sender",
    "Amount",
    "Asset Code",
    "Split Type",
    "Status",
  ];

  const rows: string[][] = [];

  for (const e of filteredExpenses) {
    rows.push([
      "Expense",
      e.id,
      e.createdAt,
      e.title,
      e.payer?.displayName ?? e.payerUserId,
      e.amount,
      e.assetCode,
      e.splitType,
      "completed",
    ]);
  }

  for (const s of filteredSettlements) {
    rows.push([
      "Settlement",
      s.id,
      s.createdAt,
      s.memo ?? "Settlement payment",
      s.fromUserId,
      s.amount,
      s.assetCode,
      "settlement",
      s.status,
    ]);
  }

  const csvLines = [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) => row.map(escapeCsvField).join(",")),
  ];

  return csvLines.join("\n");
}

/**
 * Formats group expenses and settlements into a clean JSON blob string.
 */
export function buildGroupExportJson(
  expenses: Expense[],
  settlements: Settlement[],
  options: GroupExportOptions = {}
): string {
  const { startDate, endDate } = options;

  const filteredExpenses = expenses.filter((e) => {
    const d = e.createdAt.slice(0, 10);
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  });

  const filteredSettlements = settlements.filter((s) => {
    const d = s.createdAt.slice(0, 10);
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  });

  const payload = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    expenses: filteredExpenses,
    settlements: filteredSettlements,
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Triggers a browser file download securely.
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
