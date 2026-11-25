/**
 * Client-side CSV export for the filtered transaction history view (#899).
 *
 * The History page already narrows the loaded expenses and settlements by
 * kind, keyword, asset, status and date window. This module turns exactly
 * those visible rows into an RFC 4180 CSV document and hands it to the
 * browser as a download, so no extra server endpoint is involved.
 *
 * RFC 4180 rules applied here:
 *  - records are separated by CRLF;
 *  - a field containing a comma, a double quote, CR or LF is wrapped in
 *    double quotes, and embedded double quotes are doubled;
 *  - every record has the same number of fields as the header.
 *
 * Spreadsheet formula injection (CWE-1236) is neutralised as well: a text
 * field starting with `=`, `+`, `-`, `@`, TAB or CR is prefixed with a single
 * quote so Excel / Sheets display it rather than evaluate it. Plain numeric
 * values (amounts) are left untouched so they still import as numbers.
 */

import type { Expense, Settlement } from "./types";

/** Column order of the exported file. */
export const TRANSACTION_CSV_HEADERS = [
  "Timestamp",
  "Type",
  "Memo",
  "Sender",
  "Receiver",
  "Asset",
  "Amount",
] as const;

export type TransactionCsvRecord = Record<
  (typeof TRANSACTION_CSV_HEADERS)[number],
  string
>;

/** One item exactly as the History page holds it after filtering. */
export type HistoryExportItem =
  | { type: "expense"; item: Expense }
  | { type: "settlement"; item: Settlement };

const RFC4180_NEEDS_QUOTES = /[",\r\n]/;
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

/**
 * Encode one value as an RFC 4180 field.
 *
 * `null` / `undefined` become an empty field. Leading or trailing spaces are
 * preserved by quoting, since some importers trim unquoted fields.
 */
export function toCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (FORMULA_PREFIX.test(text) && !PLAIN_NUMBER.test(text)) {
    text = `'${text}`;
  }
  const needsQuotes =
    RFC4180_NEEDS_QUOTES.test(text) || /^\s|\s$/.test(text);
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Join fields into one CSV record (no line terminator). */
export function toCsvRecord(
  fields: ReadonlyArray<string | number | null | undefined>
): string {
  return fields.map(toCsvField).join(",");
}

/** "Alice (GABC…)" when a public key is known, otherwise just the name. */
function describeParty(
  user: { displayName?: string | null; stellarPublicKey?: string | null } | null | undefined
): string {
  if (!user) return "";
  const name = user.displayName?.trim() ?? "";
  const key = user.stellarPublicKey?.trim() ?? "";
  if (name && key) return `${name} (${key})`;
  return name || key;
}

/**
 * Normalise a history item into the exported columns.
 *
 * - Settlements are direct transfers: sender is `from`, receiver is `to`.
 * - Expenses are paid by the payer on behalf of the participants: sender is
 *   the payer and receiver lists every other participant, separated by `; `.
 */
export function historyItemToCsvRecord(
  entry: HistoryExportItem
): TransactionCsvRecord {
  if (entry.type === "settlement") {
    const s = entry.item;
    return {
      Timestamp: s.createdAt ?? "",
      Type: "settlement",
      Memo: s.memo ?? "",
      Sender: describeParty(s.from),
      Receiver: describeParty(s.to),
      Asset: s.assetCode ?? "",
      Amount: s.amount ?? "",
    };
  }

  const e = entry.item;
  const receivers = (e.shares ?? [])
    .filter((share) => share.userId !== e.payerUserId)
    .map((share) => describeParty(share.user))
    .filter(Boolean)
    .join("; ");
  return {
    Timestamp: e.createdAt ?? "",
    Type: "expense",
    Memo: e.memo ?? "",
    Sender: describeParty(e.payer),
    Receiver: receivers,
    Asset: e.assetCode ?? "",
    Amount: e.amount ?? "",
  };
}

/**
 * Build the full CSV document. An empty list still produces the header row,
 * so the downloaded file always opens with the expected columns.
 */
export function buildTransactionCsv(
  items: ReadonlyArray<HistoryExportItem>
): string {
  const lines = [toCsvRecord(TRANSACTION_CSV_HEADERS)];
  for (const entry of items) {
    const record = historyItemToCsvRecord(entry);
    lines.push(toCsvRecord(TRANSACTION_CSV_HEADERS.map((h) => record[h])));
  }
  return lines.join("\r\n") + "\r\n";
}

export interface TransactionCsvFilenameOptions {
  assetCode?: string;
  startDate?: string;
  endDate?: string;
  now?: Date;
}

/**
 * `mergepay-transactions-<today>[-<asset>][-from-<d>][-to-<d>].csv`, so the
 * file name records which filters produced it.
 */
export function buildTransactionCsvFilename({
  assetCode,
  startDate,
  endDate,
  now = new Date(),
}: TransactionCsvFilenameOptions = {}): string {
  const safe = (part: string) => part.replace(/[^A-Za-z0-9-]/g, "");
  const parts = ["mergepay-transactions", now.toISOString().slice(0, 10)];
  if (assetCode && assetCode !== "ALL") parts.push(safe(assetCode));
  if (startDate) parts.push(`from-${safe(startDate)}`);
  if (endDate) parts.push(`to-${safe(endDate)}`);
  return `${parts.join("-")}.csv`;
}

/**
 * Hand `csv` to the browser as a file download using a Blob and a temporary
 * object URL. A UTF-8 BOM is prepended so Excel detects the encoding and
 * renders non-ASCII names correctly.
 */
export function downloadCsv(csv: string, filename: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    document.body.removeChild(link);
    // Revoke on the next tick: some browsers start the download
    // asynchronously after click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
