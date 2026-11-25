import { escapeCsv } from "./export";
import { parseApiTimestamp } from "./datetime";
import type { TreasuryTransaction } from "./types";

// ---------------------------------------------------------------------------
// Treasury transaction CSV export (#860)
//
// Builds an RFC-4180-compliant CSV of a group's treasury transaction history
// for accounting and offline record-keeping. Every field passes through
// `escapeCsv`, which handles structural quoting and OWASP formula-injection
// neutralization, matching the group statement exporter in `csvStatement.ts`.
//
// Rows are emitted newest-first, matching the order the API returns them.
// An empty history returns `null` so callers can disable the export instead
// of producing a header-only or malformed file.
// ---------------------------------------------------------------------------

export const TREASURY_CSV_HEADERS = [
  "Date",
  "Direction",
  "Member",
  "Member Public Key",
  "Asset",
  "Amount",
  "Asset Issuer",
  "Destination",
  "Memo",
  "Status",
  "Tx Hash",
] as const;

function formatTreasuryDate(iso: string): string {
  const parsed = parseApiTimestamp(iso);
  // Full ISO instant keeps the export sortable in spreadsheets; unparseable
  // values fall back to the raw string rather than an empty cell.
  return parsed.date ? parsed.date.toISOString() : iso;
}

function directionLabel(direction: TreasuryTransaction["direction"]): string {
  return direction === "deposit" ? "Deposit" : "Withdrawal";
}

function statusLabel(status: TreasuryTransaction["status"]): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function memberLabel(tx: TreasuryTransaction): string {
  return tx.user?.displayName ?? tx.userId ?? "Unknown member";
}

/**
 * Build the treasury transaction CSV, or `null` when there is nothing to
 * export — callers should treat `null` as "disable the button", not as an
 * error.
 */
export function buildTreasuryTransactionsCsv(
  transactions: readonly TreasuryTransaction[] | null | undefined
): string | null {
  if (!transactions || transactions.length === 0) return null;

  const lines = [TREASURY_CSV_HEADERS.map(escapeCsv).join(",")];
  for (const tx of transactions) {
    if (!tx) continue;
    lines.push(
      [
        formatTreasuryDate(tx.createdAt),
        directionLabel(tx.direction),
        memberLabel(tx),
        tx.user?.stellarPublicKey ?? "",
        tx.assetCode,
        tx.amount,
        tx.assetIssuer ?? "",
        tx.destination ?? "",
        tx.memo ?? "",
        statusLabel(tx.status),
        tx.stellarTxHash ?? "",
      ]
        .map(escapeCsv)
        .join(",")
    );
  }
  return lines.length > 1 ? `${lines.join("\n")}\n` : null;
}

/**
 * Suggested download filename, e.g. `mergepay-treasury-2026-11-25.csv`.
 * The date makes repeated exports distinguishable without a timestamp.
 */
export function treasuryCsvFilename(now: Date = new Date()): string {
  return `mergepay-treasury-${now.toISOString().slice(0, 10)}.csv`;
}
