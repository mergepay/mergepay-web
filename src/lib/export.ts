import type { Expense, Settlement } from "./types";
import { explorerTxUrl } from "./constants";

export function buildExpenseExportJson(expenses: Expense[]): string {
  return JSON.stringify(
    expenses.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      amount: e.amount,
      assetCode: e.assetCode,
      assetIssuer: e.assetIssuer,
      splitType: e.splitType,
      memo: e.memo,
      paidBy: e.payer.displayName,
      paidByAddress: e.payer.stellarPublicKey,
      createdAt: e.createdAt,
      shares: e.shares.map((s) => ({
        user: s.user.displayName,
        userAddress: s.user.stellarPublicKey,
        amount: s.shareAmount,
        status: s.status,
      })),
    })),
    null,
    2
  );
}

export function buildFilteredExpenseExportJson(
  expenses: Expense[],
  options?: { startDate?: string; endDate?: string }
): string {
  const filtered = expenses.filter((e) => {
    const date = e.createdAt.slice(0, 10);
    if (options?.startDate && date < options.startDate) return false;
    if (options?.endDate && date > options.endDate) return false;
    return true;
  });
  return buildExpenseExportJson(filtered);
}

export function exportExpenseJson(expenses: Expense[], filename: string): void {
  download(filename, buildExpenseExportJson(expenses), "application/json;charset=utf-8");
}

export function exportExpenseCsv(csvContent: string, filename: string): void {
  download(filename, csvContent, "text/csv;charset=utf-8");
}


/**
 * Characters that make a spreadsheet treat a cell as a formula.
 * Excel / LibreOffice / Google Sheets all evaluate a leading `=`, `+`, `-` or
 * `@`; a leading tab or carriage return can smuggle one of those past naive
 * filters because the app trims it before parsing.
 */
const CSV_FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Quote a value for CSV structure *and* neutralize formula injection.
 *
 * Structural quoting alone is not enough: a memo of `=1+1` is a perfectly
 * valid CSV field that a spreadsheet will happily evaluate — and formulas can
 * pull in other cells or external data (`=HYPERLINK(...)`, `=IMPORTXML(...)`).
 * Per OWASP guidance such values get a single-quote prefix, which spreadsheets
 * strip on display while treating the remainder as literal text.
 */
export function escapeCsv(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  if (s.length > 0 && CSV_FORMULA_PREFIXES.includes(s[0] as string)) {
    s = `'${s}`;
  }
  if (/[",\n\r\t]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * HTML-encode a value for interpolation into element content or a quoted
 * attribute — the five characters that can break out of either context.
 */
export function escapeHtml(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Stellar transaction hashes are 32 bytes rendered as hex. */
const TX_HASH_RE = /^[0-9a-f]{64}$/i;

export function isValidTxHash(hash: string | null | undefined): hash is string {
  return typeof hash === "string" && TX_HASH_RE.test(hash);
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildHistoryCsv(
  expenses: Expense[],
  settlements: Settlement[]
): string {
  const rows: string[] = [];
  rows.push(
    [
      "type",
      "date",
      "title_or_parties",
      "amount",
      "asset",
      "status",
      "memo",
      "stellar_tx_hash",
    ].join(",")
  );

  for (const e of expenses) {
    rows.push(
      [
        "expense",
        e.createdAt,
        `${e.title} (paid by ${e.payer.displayName})`,
        e.amount,
        e.assetCode,
        e.splitType,
        e.memo ?? "",
        "",
      ]
        .map(escapeCsv)
        .join(",")
    );
  }

  for (const s of settlements) {
    rows.push(
      [
        "settlement",
        s.createdAt,
        `${s.from.displayName} -> ${s.to.displayName}`,
        s.amount,
        s.assetCode,
        s.status,
        s.memo ?? "",
        s.stellarTxHash ?? "",
      ]
        .map(escapeCsv)
        .join(",")
    );
  }

  return rows.join("\n");
}

export function exportHistoryCsv(expenses: Expense[], settlements: Settlement[]) {
  download(
    `mergepay-history-${new Date().toISOString().slice(0, 10)}.csv`,
    buildHistoryCsv(expenses, settlements),
    "text/csv;charset=utf-8"
  );
}

/**
 * Build the printable receipt document for a settlement.
 *
 * Every interpolated value is user-controlled — display names are editable via
 * `PATCH /me` and memos are free-form — so all of them go through
 * `escapeHtml`. The explorer link is only emitted when `explorerTxUrl`
 * returns a URL (valid hash + configured network); a present but malformed
 * hash is printed as plain text so the reference is still available.
 *
 * Kept separate from `printReceipt` so it can be unit-tested without a DOM.
 */
export function buildReceiptHtml(settlement: Settlement): string {
  // `null` when the settlement has no hash yet, or the hash is malformed. A
  // malformed or absent hash is omitted from the receipt entirely (the row is
  // guarded by `isValidTxHash` below), so untrusted values never reach the
  // markup; a valid hash always resolves to an explorer link.
  const explorer = explorerTxUrl(settlement.stellarTxHash);
  const createdAt = new Date(settlement.createdAt);
  const createdAtLabel = Number.isNaN(createdAt.getTime())
    ? settlement.createdAt
    : createdAt.toLocaleString();

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <title>Mergepay receipt ${escapeHtml(settlement.id)}</title>
  <style>
    body{font-family:ui-monospace,Menlo,monospace;background:#FBF3E2;color:#18130E;padding:40px;}
    .card{border:3px solid #18130E;border-radius:18px;background:#FFF9EC;padding:28px;box-shadow:6px 6px 0 #18130E;max-width:420px;margin:auto;}
    h1{font-size:20px;letter-spacing:.05em;text-transform:uppercase;margin:0 0 4px;}
    .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #18130E55;font-size:13px;}
    .amt{font-size:30px;font-weight:700;margin:18px 0;}
    a{color:#6C4DF6;word-break:break-all;font-size:11px;}
    .tag{display:inline-block;background:#D7F94B;border:2px solid #18130E;border-radius:8px;padding:2px 8px;font-size:10px;text-transform:uppercase;}
  </style></head><body>
  <div class="card">
    <span class="tag">Mergepay · Stellar receipt</span>
    <h1>Settlement</h1>
    <div class="amt">${escapeHtml(settlement.amount)} ${escapeHtml(settlement.assetCode)}</div>
    <div class="row"><span>From</span><b>${escapeHtml(settlement.from.displayName)}</b></div>
    <div class="row"><span>To</span><b>${escapeHtml(settlement.to.displayName)}</b></div>
    <div class="row"><span>Status</span><b>${escapeHtml(settlement.status)}</b></div>
    <div class="row"><span>Memo</span><b>${escapeHtml(settlement.memo ?? "—")}</b></div>
    <div class="row"><span>Date</span><b>${escapeHtml(createdAtLabel)}</b></div>
    ${
      isValidTxHash(settlement.stellarTxHash)
        ? `<div class="row"><span>Tx hash</span></div>${
            explorer
              ? `<a href="${escapeHtml(
                  explorer
                )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                  settlement.stellarTxHash
                )}</a>`
              : `<code>${escapeHtml(settlement.stellarTxHash)}</code>`
          }`
        : ""
    }
  </div>
  <script>window.onload=()=>window.print()</script>
  </body></html>`;
}

/**
 * Lightweight printable receipt: opens a styled window the user can save as PDF.
 * Avoids a heavy client-side PDF dependency while still producing a clean doc.
 */
export function printReceipt(settlement: Settlement) {
  const w = window.open("", "_blank", "width=520,height=700");
  if (!w) return;
  w.document.write(buildReceiptHtml(settlement));
  w.document.close();
}
