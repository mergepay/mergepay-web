/**
 * Group expense-history export (#355).
 *
 * Turns a group's expenses and settlements into CSV or JSON for personal
 * bookkeeping and tax reporting. Everything is generated in the browser from
 * data the dashboard already holds — nothing is sent to a server.
 *
 * The serializers are pure (no DOM) so they can be unit tested; only
 * `downloadTextFile` touches `document`/`URL`, and it no-ops outside a
 * browser.
 *
 * Dates go through date-fns with one fixed pattern that carries the UTC
 * offset (`2026-06-15 13:00:00 +01:00`), so a spreadsheet row is never
 * ambiguous about which day a payment happened. Date-only API values keep
 * their calendar day (`2026-06-15`). CSV cells are escaped with `escapeCsv`,
 * which also neutralizes spreadsheet formula injection.
 */

import { format } from "date-fns";
import { escapeCsv } from "../export";
import { parseApiTimestamp } from "../datetime";
import type { Expense, Settlement } from "../types";

export type HistoryExportFormat = "csv" | "json";

/** Pattern for every exported timestamp. */
export const EXPORT_DATE_PATTERN = "yyyy-MM-dd HH:mm:ss xxx";
/** Pattern for date-only API values. */
export const EXPORT_DAY_PATTERN = "yyyy-MM-dd";

/** Render an API timestamp for export; empty string when unparseable. */
export function formatHistoryDate(value: string | null | undefined): string {
  const parsed = parseApiTimestamp(value);
  if (!parsed.date) return "";
  return format(parsed.date, parsed.kind === "date" ? EXPORT_DAY_PATTERN : EXPORT_DATE_PATTERN);
}

export type ExpenseSettlementState = "settled" | "partially_settled" | "pending";

/** Whether every, some, or none of an expense's shares are settled. */
export function expenseSettlementState(expense: Expense): ExpenseSettlementState {
  const shares = expense.shares ?? [];
  const settled = shares.filter((s) => s.status === "settled").length;
  if (shares.length > 0 && settled === shares.length) return "settled";
  return settled > 0 ? "partially_settled" : "pending";
}

export function hasExportableHistory(expenses: Expense[], settlements: Settlement[]): boolean {
  return expenses.length > 0 || settlements.length > 0;
}

/** One CSV row: an expense or a settlement, flattened to shared columns. */
export interface HistoryRecord {
  type: "expense" | "settlement";
  id: string;
  date: string;
  createdAt: string;
  description: string;
  from: string;
  to: string;
  amount: string;
  asset: string;
  assetIssuer: string;
  status: string;
  splitType: string;
  participants: string;
  memo: string;
  stellarTxHash: string;
}

export const HISTORY_CSV_COLUMNS: { key: keyof HistoryRecord; header: string }[] = [
  { key: "type", header: "Type" },
  { key: "date", header: "Date" },
  { key: "description", header: "Description" },
  { key: "from", header: "Paid By / From" },
  { key: "to", header: "To" },
  { key: "amount", header: "Amount" },
  { key: "asset", header: "Asset" },
  { key: "assetIssuer", header: "Asset Issuer" },
  { key: "status", header: "Status" },
  { key: "splitType", header: "Split Type" },
  { key: "participants", header: "Participants" },
  { key: "memo", header: "Memo" },
  { key: "stellarTxHash", header: "Stellar Tx Hash" },
  { key: "id", header: "Record ID" },
];

function expenseRecord(e: Expense): HistoryRecord {
  return {
    type: "expense",
    id: e.id,
    date: formatHistoryDate(e.createdAt),
    createdAt: e.createdAt,
    description: e.title,
    from: e.payer?.displayName ?? "",
    to: "",
    amount: e.amount,
    asset: e.assetCode,
    assetIssuer: e.assetIssuer ?? "",
    status: expenseSettlementState(e),
    splitType: e.splitType,
    participants: (e.shares ?? [])
      .map((s) => `${s.user?.displayName ?? s.userId}: ${s.shareAmount} (${s.status})`)
      .join("; "),
    memo: e.memo ?? "",
    stellarTxHash: "",
  };
}

function settlementRecord(s: Settlement): HistoryRecord {
  return {
    type: "settlement",
    id: s.id,
    date: formatHistoryDate(s.createdAt),
    createdAt: s.createdAt,
    description: `${s.from?.displayName ?? s.fromUserId} paid ${s.to?.displayName ?? s.toUserId}`,
    from: s.from?.displayName ?? "",
    to: s.to?.displayName ?? "",
    amount: s.amount,
    asset: s.assetCode,
    assetIssuer: s.assetIssuer ?? "",
    status: s.status,
    splitType: "",
    participants: "",
    memo: s.memo ?? "",
    stellarTxHash: s.stellarTxHash ?? "",
  };
}

function timeOf(value: string): number {
  const t = parseApiTimestamp(value).date?.getTime();
  return t === undefined ? Number.NEGATIVE_INFINITY : t;
}

/** Expenses and settlements merged into one chronological (oldest first) list. */
export function buildHistoryRecords(expenses: Expense[], settlements: Settlement[]): HistoryRecord[] {
  return [...expenses.map(expenseRecord), ...settlements.map(settlementRecord)].sort(
    (a, b) => timeOf(a.createdAt) - timeOf(b.createdAt)
  );
}

/**
 * CSV with a header row, CRLF line endings (RFC 4180) and a UTF-8 BOM so
 * Excel opens non-ASCII names correctly. An empty history yields just the
 * header row.
 */
export function historyToCsv(expenses: Expense[], settlements: Settlement[]): string {
  const lines = [HISTORY_CSV_COLUMNS.map((c) => escapeCsv(c.header)).join(",")];
  for (const record of buildHistoryRecords(expenses, settlements)) {
    lines.push(HISTORY_CSV_COLUMNS.map((c) => escapeCsv(record[c.key])).join(","));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

export interface HistoryJsonOptions {
  groupId: string;
  groupName?: string | null;
  exportedAt?: Date;
}

/**
 * Structured JSON export. Keeps the full per-share breakdown and raw API
 * timestamps alongside the formatted dates, so the file can be re-imported
 * or reconciled against Stellar without loss.
 */
export function historyToJson(
  expenses: Expense[],
  settlements: Settlement[],
  { groupId, groupName = null, exportedAt = new Date() }: HistoryJsonOptions
): string {
  const payload = {
    schemaVersion: 1,
    group: { id: groupId, name: groupName },
    exportedAt: format(exportedAt, EXPORT_DATE_PATTERN),
    totals: { expenses: expenses.length, settlements: settlements.length },
    expenses: [...expenses]
      .sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt))
      .map((e) => ({
        id: e.id,
        date: formatHistoryDate(e.createdAt),
        createdAt: e.createdAt,
        title: e.title,
        description: e.description,
        amount: e.amount,
        assetCode: e.assetCode,
        assetIssuer: e.assetIssuer,
        splitType: e.splitType,
        status: expenseSettlementState(e),
        memo: e.memo,
        paidBy: {
          userId: e.payerUserId,
          displayName: e.payer?.displayName ?? null,
          stellarPublicKey: e.payer?.stellarPublicKey ?? null,
        },
        shares: (e.shares ?? []).map((s) => ({
          userId: s.userId,
          displayName: s.user?.displayName ?? null,
          stellarPublicKey: s.user?.stellarPublicKey ?? null,
          amount: s.shareAmount,
          status: s.status,
        })),
      })),
    settlements: [...settlements]
      .sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt))
      .map((s) => ({
        id: s.id,
        date: formatHistoryDate(s.createdAt),
        createdAt: s.createdAt,
        from: { userId: s.fromUserId, displayName: s.from?.displayName ?? null },
        to: { userId: s.toUserId, displayName: s.to?.displayName ?? null },
        amount: s.amount,
        assetCode: s.assetCode,
        assetIssuer: s.assetIssuer,
        status: s.status,
        memo: s.memo,
        stellarTxHash: s.stellarTxHash,
        expenseId: s.expenseId,
      })),
  };
  return JSON.stringify(payload, null, 2);
}

/** Lowercase, dash-separated, filesystem-safe slug; falls back to `group`. */
export function slugifyForFilename(value: string | null | undefined): string {
  const slug = (value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "group";
}

/** `mergepay-<group>-history-20260927-134500.csv` */
export function buildHistoryExportFilename(
  group: string | null | undefined,
  fileFormat: HistoryExportFormat,
  now: Date = new Date()
): string {
  return `mergepay-${slugifyForFilename(group)}-history-${format(now, "yyyyMMdd-HHmmss")}.${fileFormat}`;
}

export const EXPORT_MIME_TYPES: Record<HistoryExportFormat, string> = {
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
};

/**
 * Save `content` as a file in the browser. Returns `false` (and does
 * nothing) when there is no DOM, e.g. during server rendering.
 *
 * The anchor is attached to the document before clicking (Firefox ignores
 * clicks on detached anchors) and the object URL is revoked on the next
 * tick rather than synchronously, so Safari has started the download
 * before the URL goes away.
 */
export function downloadTextFile(content: string, filename: string, mimeType: string): boolean {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return false;
  }
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return true;
}

/** Build and download a history export; returns the filename, or `null` if nothing was saved. */
export function exportGroupHistory(
  fileFormat: HistoryExportFormat,
  expenses: Expense[],
  settlements: Settlement[],
  options: HistoryJsonOptions
): string | null {
  const now = options.exportedAt ?? new Date();
  const content =
    fileFormat === "csv"
      ? historyToCsv(expenses, settlements)
      : historyToJson(expenses, settlements, { ...options, exportedAt: now });
  const filename = buildHistoryExportFilename(options.groupName || options.groupId, fileFormat, now);
  return downloadTextFile(content, filename, EXPORT_MIME_TYPES[fileFormat]) ? filename : null;
}
