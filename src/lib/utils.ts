import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { escapeCsv } from "./export";
import { parseApiTimestamp } from "./datetime";
import type { Expense, ShareStatus } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Expense history CSV export (issue #202)
//
// The construction logic lives here (in `src/lib/utils.ts`, per the issue) and
// reuses the `escapeCsv` helper from `src/lib/export.ts`, which already handles
// structural quoting (commas, quotes, newlines) *and* OWASP formula-injection
// neutralization. These builders are pure — no DOM — so they are unit-testable
// and the caller (the `ExportHistoryButton` component) owns the download via
// `URL.createObjectURL`.
// ---------------------------------------------------------------------------

/** Status filter offered in the export dialog: settled / unsettled / all. */
export type ExportStatusFilter = "all" | "settled" | "unsettled";

export interface ExportFilters {
  status: ExportStatusFilter;
  /** Inclusive lower bound, ISO `YYYY-MM-DD`. */
  startDate?: string;
  /** Inclusive upper bound, ISO `YYYY-MM-DD`. */
  endDate?: string;
}

/**
 * Derive the user-facing "Settlement Status" for a share. A share is
 * "Settled" only once it reaches the terminal `settled` state; anything else
 * (pending / settling) is "Unsettled".
 */
export function exportSettlementStatus(
  status: ShareStatus | undefined
): "Settled" | "Unsettled" {
  return status === "settled" ? "Settled" : "Unsettled";
}

/**
 * Format an API timestamp as the ISO `YYYY-MM-DD` the issue requires.
 *
 * `createdAt` values are ISO instants (UTC), so we slice the UTC date to stay
 * deterministic regardless of the reader's timezone. Unparseable values yield
 * an empty string.
 */
export function formatExportDate(iso: string | null | undefined): string {
  const parsed = parseApiTimestamp(iso);
  if (!parsed.date) return "";
  return parsed.date.toISOString().slice(0, 10);
}

/**
 * Compose the file name for an expense history export:
 * `mergepay-export-{group-id}-{timestamp}.csv`.
 */
export function buildExportFilename(groupId: string, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `mergepay-export-${groupId}-${stamp}.csv`;
}

/**
 * Whether an expense matches a status filter, judged on the current user's
 * share (the same share whose status appears in the CSV's "Settlement Status"
 * column).
 */
export function matchesExportStatus(
  expense: Expense,
  currentUserId: string,
  filter: ExportStatusFilter
): boolean {
  if (filter === "all") return true;
  const share = expense.shares.find((s) => s.userId === currentUserId);
  const settled = share?.status === "settled";
  return filter === "settled" ? settled : !settled;
}

/**
 * Whether an expense falls within the selected date range (inclusive),
 * compared on the ISO `YYYY-MM-DD` date. An unparseable date is excluded from
 * any range the user actually narrowed.
 */
export function matchesExportDateRange(
  expense: Expense,
  filters: Pick<ExportFilters, "startDate" | "endDate">
): boolean {
  const date = formatExportDate(expense.createdAt);
  if (!date) return !filters.startDate && !filters.endDate;
  if (filters.startDate && date < filters.startDate) return false;
  if (filters.endDate && date > filters.endDate) return false;
  return true;
}

/**
 * Build an RFC 4180 well-formed CSV of the group's expenses with the columns
 * required by the issue: Date, Description, Base Amount, Asset Code, Payer
 * Address, Split Mode, Your Share, Settlement Status.
 *
 * Every field is run through `escapeCsv`, so commas, quotes, newlines and
 * formula prefixes (`=`, `+`, `-`, `@`, tab, CR) are neutralized. Rows are
 * sorted oldest-first so the exported history reads naturally in a
 * spreadsheet.
 */
export function buildExpenseExportCsv(
  expenses: Expense[],
  currentUserId: string,
  filters: ExportFilters
): string {
  const headers = [
    "Date",
    "Description",
    "Base Amount",
    "Asset Code",
    "Payer Address",
    "Split Mode",
    "Your Share",
    "Settlement Status",
  ];

  const rows = [...expenses]
    .filter((e) => matchesExportDateRange(e, filters))
    .filter((e) => matchesExportStatus(e, currentUserId, filters.status))
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
    .map((e) => {
      const share = e.shares.find((s) => s.userId === currentUserId);
      return [
        formatExportDate(e.createdAt),
        e.title,
        e.amount,
        e.assetCode,
        e.payer.stellarPublicKey,
        e.splitType,
        share?.shareAmount ?? "",
        exportSettlementStatus(share?.status ?? "pending"),
      ]
        .map(escapeCsv)
        .join(",");
    });

  return [headers.join(","), ...rows].join("\n");
}
