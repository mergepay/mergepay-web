import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTreasuryTransactionsCsv,
  treasuryCsvFilename,
  TREASURY_CSV_HEADERS,
} from "../treasuryCsv";
import type { TreasuryTransaction } from "../types";

function makeTx(overrides: Partial<TreasuryTransaction> = {}): TreasuryTransaction {
  return {
    id: "tx-1",
    groupId: "group-1",
    userId: "user-1",
    user: {
      id: "user-1",
      stellarPublicKey: "GABC123",
      displayName: "Alice",
      avatarUrl: null,
      createdAt: "2024-01-01T00:00:00.000Z",
    },
    direction: "deposit",
    amount: "12.5",
    assetCode: "USDC",
    assetIssuer: "issuer-1",
    destination: null,
    stellarTxHash: "a".repeat(64),
    status: "confirmed",
    memo: null,
    createdAt: "2026-11-20T10:30:00.000Z",
    ...overrides,
  };
}

describe("buildTreasuryTransactionsCsv", () => {
  it("returns null for empty or missing history", () => {
    assert.equal(buildTreasuryTransactionsCsv([]), null);
    assert.equal(buildTreasuryTransactionsCsv(null), null);
    assert.equal(buildTreasuryTransactionsCsv(undefined), null);
  });

  it("emits a header row and one row per transaction", () => {
    const csv = buildTreasuryTransactionsCsv([makeTx()]);
    assert.ok(csv);
    const lines = csv.trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(lines[0], TREASURY_CSV_HEADERS.join(","));
    assert.ok(lines[1].includes("Deposit"));
    assert.ok(lines[1].includes("Alice"));
    assert.ok(lines[1].includes("12.5"));
    assert.ok(lines[1].includes("USDC"));
    assert.ok(lines[1].includes("Confirmed"));
  });

  it("labels withdrawals and humanizes multi-word statuses", () => {
    const csv = buildTreasuryTransactionsCsv([
      makeTx({ direction: "withdrawal", status: "awaiting_signatures" }),
    ]);
    assert.ok(csv);
    const row = csv.trim().split("\n")[1];
    assert.ok(row.includes("Withdrawal"));
    assert.ok(row.includes("Awaiting Signatures"));
  });

  it("escapes commas, quotes and newlines in free-text fields", () => {
    const csv = buildTreasuryTransactionsCsv([
      makeTx({ memo: 'paid "rent", June\nfinal' }),
    ]);
    assert.ok(csv);
    // The newline stays inside the quoted cell, so assert on the whole doc.
    assert.ok(csv.includes('"paid ""rent"", June\nfinal"'));
  });

  it("neutralizes spreadsheet formula injection in member names", () => {
    const csv = buildTreasuryTransactionsCsv([
      makeTx({
        user: {
          id: "u",
          stellarPublicKey: "G",
          displayName: "=HYPERLINK(\"http://evil\")",
          avatarUrl: null,
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      }),
    ]);
    assert.ok(csv);
    const row = csv.trim().split("\n")[1];
    assert.ok(row.includes("'=HYPERLINK"));
  });

  it("handles missing user, destination and tx hash gracefully", () => {
    const csv = buildTreasuryTransactionsCsv([
      makeTx({ user: null, userId: null, destination: null, stellarTxHash: null }),
    ]);
    assert.ok(csv);
    const row = csv.trim().split("\n")[1];
    assert.ok(row.includes("Unknown member"));
    // The row still has the full column count (11 fields -> 10 commas).
    assert.equal(row.split(",").length >= 11, true);
  });

  it("formats createdAt as a sortable ISO instant", () => {
    const csv = buildTreasuryTransactionsCsv([makeTx()]);
    assert.ok(csv);
    assert.ok(csv.includes("2026-11-20T10:30:00.000Z"));
  });
});

describe("treasuryCsvFilename", () => {
  it("produces a dated csv filename", () => {
    assert.equal(
      treasuryCsvFilename(new Date("2026-11-25T12:00:00.000Z")),
      "mergepay-treasury-2026-11-25.csv"
    );
  });
});
