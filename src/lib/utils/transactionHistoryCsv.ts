/**
 * Transaction-history CSV export (#395).
 *
 * Formats group expenses and settlements into a single downloadable
 * spreadsheet file, generated entirely in the browser — no server round-trip.
 *
 * Every field is passed through `escapeCsv` (from `src/lib/export.ts`), which
 * handles RFC 4180 structural quoting (commas, quotes, newlines) *and* OWASP
 * formula-injection neutralization (leading `=`, `+`, `-`, `@`, tab, CR), so
 * a memo or title that looks like a spreadsheet formula can never execute in
 * the reader's spreadsheet.
 *
 * The builders here are pure — no DOM — so they are unit-testable; the
 * download helper is the only function that touches the browser.
 */

import { escapeCsv } from "../export";
import { formatExportDate } from "../utils";
import type { Expense, Settlement } from "../types";

/** Human-readable status label for a settlement row. */
function settlementStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "submitted":
      return "Submitted";
    case "confirmed":
      return "Confirmed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

/** Every participant's display name on an expense, for the Participants cell. */
function expenseParticipants(e: Expense): string {
  const names = e.shares.map((s) => s.user?.displayName).filter(Boolean);
  return names.length > 0 ? names.join("; ") : "";
}

/**
 * Build a well-formed CSV of the full transaction history (expenses +
 * settlements), sorted newest-first to match the on-screen history view.
 *
 * Columns:
 *   Type, Date, Title, Description, Amount, Asset, From, To, Status, Memo, Tx Hash
 *
 * - Expenses: From = payer, To = participating members, Status = split mode.
 * - Settlements: From/To = sender/recipient, Status = settlement status.
 *
 * @example
 * ```ts
 * const csv = buildTransactionHistoryCsv(expenses, settlements);
 * ```
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

  type CsvRow = {
    /** Sort key — timestamp of the record, newest first. */
    at: number;
    cells: (string | number | null | undefined)[];
  };

  const rows: CsvRow[] = [];

  for (const e of expenses) {
    rows.push({
      at: new Date(e.createdAt).getTime(),
      cells: [
        "expense",
        formatExportDate(e.createdAt),
        e.title,
        e.description ?? "",
        e.amount,
        e.assetCode,
        e.payer.displayName,
        expenseParticipants(e),
        e.splitType,
        e.memo ?? "",
        "",
      ],
    });
  }

  for (const s of settlements) {
    rows.push({
      at: new Date(s.createdAt).getTime(),
      cells: [
        "settlement",
        formatExportDate(s.createdAt),
        "",
        "",
        s.amount,
        s.assetCode,
        s.from.displayName,
        s.to.displayName,
        settlementStatusLabel(s.status),
        s.memo ?? "",
        s.stellarTxHash ?? "",
      ],
    });
  }

  rows.sort((a, b) => b.at - a.at);

  const body = rows.map((row) => row.cells.map(escapeCsv).join(","));
  return [headers.join(","), ...body].join("\n");
}

/**
 * Compose the file name for a transaction-history export:
 * `mergepay-history-{YYYY-MM-DD}T{HH-MM-SS}-{ms}Z.csv` — a clear, unique
 * timestamp so repeated exports never overwrite each other.
 */
export function buildTransactionHistoryFilename(
  now: Date = new Date()
): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `mergepay-history-${stamp}.csv`;
}

/**
 * Trigger a browser download of the full transaction history as a CSV.
 *
 * Uses `URL.createObjectURL` + a temporary anchor element, the same pattern
 * used elsewhere in the codebase (`csvStatement.ts`, `ExportHistoryButton`).
 */
export function exportTransactionHistoryCsv(
  expenses: Expense[],
  settlements: Settlement[]
): void {
  const csv = buildTransactionHistoryCsv(expenses, settlements);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildTransactionHistoryFilename();
  a.click();
  URL.revokeObjectURL(url);
}
