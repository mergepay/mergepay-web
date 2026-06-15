import type { Expense, Settlement } from "./types";
import { explorerTxUrl } from "./constants";

function escapeCsv(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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

export function exportHistoryCsv(expenses: Expense[], settlements: Settlement[]) {
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

  download(
    `mergepay-history-${new Date().toISOString().slice(0, 10)}.csv`,
    rows.join("\n"),
    "text/csv;charset=utf-8"
  );
}

/**
 * Lightweight printable receipt: opens a styled window the user can save as PDF.
 * Avoids a heavy client-side PDF dependency while still producing a clean doc.
 */
export function printReceipt(settlement: Settlement) {
  const w = window.open("", "_blank", "width=520,height=700");
  if (!w) return;
  const explorer = settlement.stellarTxHash
    ? explorerTxUrl(settlement.stellarTxHash)
    : "";
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
  <title>Mergepay receipt ${settlement.id}</title>
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
    <div class="amt">${settlement.amount} ${settlement.assetCode}</div>
    <div class="row"><span>From</span><b>${settlement.from.displayName}</b></div>
    <div class="row"><span>To</span><b>${settlement.to.displayName}</b></div>
    <div class="row"><span>Status</span><b>${settlement.status}</b></div>
    <div class="row"><span>Memo</span><b>${settlement.memo ?? "—"}</b></div>
    <div class="row"><span>Date</span><b>${new Date(settlement.createdAt).toLocaleString()}</b></div>
    ${
      settlement.stellarTxHash
        ? `<div class="row"><span>Tx hash</span></div><a href="${explorer}">${settlement.stellarTxHash}</a>`
        : ""
    }
  </div>
  <script>window.onload=()=>window.print()</script>
  </body></html>`);
  w.document.close();
}
