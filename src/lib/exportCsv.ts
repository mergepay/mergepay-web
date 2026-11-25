import type { Expense, Settlement } from "./types";

/**
 * Characters that make a spreadsheet treat a cell as a formula.
 */
const CSV_FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Quote a value for CSV structure and neutralize formula injection.
 */
export function escapeCsv(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  if (s.length > 0 && CSV_FORMULA_PREFIXES.includes(s[0] as string)) {
    s = `'${s}`;
  }
  if (/[\",\n\r\t]/.test(s)) return `"${s.replace(/\"/g, '""')}"`;
  return s;
}

/**
 * Build a CSV string for group transaction history (expenses and settlements).
 */
export function buildTransactionHistoryCsv(
  expenses: Expense[],
  settlements: Settlement[]
): string {
  const headers = [
    "Type",
    "Date",
    "Title",
    "Description",
    "Amount",
    "Asset",
    "From",
    "To",
    "Status",
    "Memo",
    "Tx Hash",
  ];

  const rows: Array<{ date: string; line: string }> = [];

  for (const e of expenses) {
    const dateStr = e.createdAt ? e.createdAt.slice(0, 10) : "";
    const fromName = e.payer?.displayName ?? "";
    const toNames = (e.shares ?? []).map((s) => s.user?.displayName).filter(Boolean).join("; ");
    const line = [
      "expense",
      dateStr,
      e.title,
      e.description ?? "",
      e.amount,
      e.assetCode,
      fromName,
      toNames,
      e.splitType,
      e.memo ?? "",
      "",
    ]
      .map(escapeCsv)
      .join(",");

    rows.push({ date: e.createdAt, line });
  }

  for (const s of settlements) {
    const dateStr = s.createdAt ? s.createdAt.slice(0, 10) : "";
    const fromName = s.from?.displayName ?? "";
    const toName = s.to?.displayName ?? "";
    const statusReadable = s.status ? s.status.charAt(0).toUpperCase() + s.status.slice(1) : "";
    const line = [
      "settlement",
      dateStr,
      "",
      "",
      s.amount,
      s.assetCode,
      fromName,
      toName,
      statusReadable,
      s.memo ?? "",
      s.stellarTxHash ?? "",
    ]
      .map(escapeCsv)
      .join(",");

    rows.push({ date: s.createdAt, line });
  }

  // Sort newest first by date string / ISO timestamp
  rows.sort((a, b) => b.date.localeCompare(a.date));

  return [headers.join(","), ...rows.map((r) => r.line)].join("\n");
}

export function buildTransactionHistoryFilename(groupId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `mergepay-history-${groupId}-${date}.csv`;
}

export function exportTransactionHistoryCsv(
  expenses: Expense[],
  settlements: Settlement[],
  groupId: string
): void {
  const csv = buildTransactionHistoryCsv(expenses, settlements);
  const filename = buildTransactionHistoryFilename(groupId);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
