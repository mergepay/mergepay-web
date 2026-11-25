import { escapeCsv } from "./export";
import { parseApiTimestamp } from "./datetime";
import type { Expense, Settlement } from "./types";

// ---------------------------------------------------------------------------
// Group CSV Statement Generator (#240)
//
// Builds a comprehensive, RFC-4180-compliant CSV of a group's expenses
// and settlements. Every field is passed through `escapeCsv` for
// structural quoting (commas, quotes, newlines) and OWASP formula-injection
// neutralization (leading `=`, `+`, `-`, `@`, tab, CR).
//
// The statement uses one row per expense share for expenses (so each
// participant's obligation is visible) and one row per settlement.
// Rows are sorted oldest-first for natural spreadsheet reading.
// ---------------------------------------------------------------------------

export interface StatementOptions {
  /** ISO `YYYY-MM-DD` inclusive lower bound. */
  startDate?: string;
  /** ISO `YYYY-MM-DD` inclusive upper bound. */
  endDate?: string;
}

function formatStatementDate(iso: string): string {
  const parsed = parseApiTimestamp(iso);
  if (!parsed.date) return "";
  return parsed.date.toISOString().slice(0, 10);
}

function filterByDateRange(
  iso: string,
  options?: StatementOptions
): boolean {
  const date = formatStatementDate(iso);
  if (!date) return true;
  if (options?.startDate && date < options.startDate) return false;
  if (options?.endDate && date > options.endDate) return false;
  return true;
}

/**
 * Human-readable settlement status label derived from a share's status.
 */
function shareStatusLabel(status: string): string {
  switch (status) {
    case "settled":
      return "Settled";
    case "settling":
      return "Settling";
    case "pending":
      return "Pending";
    default:
      return status;
  }
}

/**
 * Build a comprehensive CSV statement for a group's expenses and
 * settlements.
 *
 * **Expenses** are expanded to one row per share, so every participant's
 * obligation appears individually — ideal for spreadsheet pivot tables
 * and tax reporting. Columns:
 *   Type, Date, Title, Description, Amount, Asset, Payer,
 *   Split Mode, Participant, Share Amount, Settlement Status,
 *   Memo
 *
 * **Settlements** are one row each with columns:
 *   Type, Date, Title, Description, Amount, Asset, Sender, Recipient,
 *   Status, Memo, Tx Hash
 *
 * @example
 * ```ts
 * const csv = buildGroupStatementCsv(expenses, settlements, {
 *   startDate: "2026-01-01",
 *   endDate: "2026-06-30",
 * });
 * ```
 */
export function buildGroupStatementCsv(
  expenses: Expense[],
  settlements: Settlement[],
  options?: StatementOptions
): string {
  const headers = [
    "Type",
    "Date",
    "Title",
    "Description",
    "Amount",
    "Asset",
    "Payer / Sender",
    "Recipient",
    "Split Mode",
    "Participant",
    "Share Amount",
    "Settlement Status",
    "Memo",
    "Tx Hash",
  ];

  const expenseRows: string[] = [];
  const settlementRows: string[] = [];

  // -- Expenses (one row per share) -------------------------------------------
  const filteredExpenses = [...expenses]
    .filter((e) => filterByDateRange(e.createdAt, options))
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  for (const e of filteredExpenses) {
    if (e.shares.length === 0) {
      // Expense with no shares — emit a single row without participant info.
      expenseRows.push(
        [
          "expense",
          formatStatementDate(e.createdAt),
          e.title,
          e.description ?? "",
          e.amount,
          e.assetCode,
          e.payer.displayName,
          "",
          e.splitType,
          "",
          "",
          "",
          e.memo ?? "",
          "",
        ]
          .map(escapeCsv)
          .join(",")
      );
      continue;
    }

    for (const share of e.shares) {
      expenseRows.push(
        [
          "expense",
          formatStatementDate(e.createdAt),
          e.title,
          e.description ?? "",
          e.amount,
          e.assetCode,
          e.payer.displayName,
          "",
          e.splitType,
          share.user.displayName,
          share.shareAmount,
          shareStatusLabel(share.status),
          e.memo ?? "",
          "",
        ]
          .map(escapeCsv)
          .join(",")
      );
    }
  }

  // -- Settlements (one row each) ---------------------------------------------
  const filteredSettlements = [...settlements]
    .filter((s) => filterByDateRange(s.createdAt, options))
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  for (const s of filteredSettlements) {
    settlementRows.push(
      [
        "settlement",
        formatStatementDate(s.createdAt),
        `${s.from.displayName} → ${s.to.displayName}`,
        "",
        s.amount,
        s.assetCode,
        s.from.displayName,
        s.to.displayName,
        "",
        "",
        "",
        s.status,
        s.memo ?? "",
        s.stellarTxHash ?? "",
      ]
        .map(escapeCsv)
        .join(",")
    );
  }

  // Interleave expenses and settlements chronologically. Each expense
  // produces one or more share rows that share the same timestamp, so
  // we group them as a single sortable block.
  interface SortableBlock {
    date: number;
    rows: string[];
  }

  const blocks: SortableBlock[] = [];
  let rowOffset = 0;
  for (const e of filteredExpenses) {
    const count = e.shares.length || 1;
    blocks.push({
      date: new Date(e.createdAt).getTime(),
      rows: expenseRows.slice(rowOffset, rowOffset + count),
    });
    rowOffset += count;
  }
  for (const s of filteredSettlements) {
    const idx = filteredSettlements.indexOf(s);
    blocks.push({
      date: new Date(s.createdAt).getTime(),
      rows: [settlementRows[idx]],
    });
  }

  blocks.sort((a, b) => a.date - b.date);

  const rows = blocks.flatMap((b) => b.rows);
  return [headers.join(","), ...rows].join("\n");
}

/**
 * Generate a descriptive filename for a group statement CSV export.
 *
 * Format: `mergepay-statement-{groupId}-{YYYY-MM-DD}.csv`
 */
export function generateGroupStatementFilename(
  groupId: string,
  now: Date = new Date()
): string {
  const date = now.toISOString().slice(0, 10);
  return `mergepay-statement-${groupId}-${date}.csv`;
}

/**
 * Trigger a browser download of the CSV content.
 *
 * Uses `URL.createObjectURL` + a temporary anchor element, the same
 * pattern used elsewhere in the codebase (`ExportHistoryButton`,
 * `ExpenseExportModal`).
 */
export function downloadStatementCsv(
  csvContent: string,
  filename: string
): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
