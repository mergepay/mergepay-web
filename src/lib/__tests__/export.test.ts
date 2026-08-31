import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildHistoryCsv,
  buildReceiptHtml,
  escapeCsv,
  escapeHtml,
  isValidTxHash,
} from "../export";
import {
  buildExpenseExportCsv,
  buildExportFilename,
  exportSettlementStatus,
  formatExportDate,
  matchesExportDateRange,
  matchesExportStatus,
} from "../utils";
import type {
  Expense,
  ExpenseShare,
  Settlement,
  ShareStatus,
  User,
} from "../types";

const VALID_HASH = "a".repeat(64);

function user(overrides: Partial<User> = {}): User {
  return {
    id: "user-a",
    stellarPublicKey: "GABC",
    displayName: "Ada",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function settlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    id: "stl-1",
    groupId: "grp-1",
    fromUserId: "user-a",
    from: user(),
    toUserId: "user-b",
    to: user({ id: "user-b", displayName: "Grace" }),
    amount: "12.5000000",
    assetCode: "XLM",
    assetIssuer: null,
    stellarTxHash: VALID_HASH,
    status: "confirmed",
    memo: "Dinner",
    expenseId: null,
    createdAt: "2024-05-01T12:00:00.000Z",
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "exp-1",
    groupId: "grp-1",
    payerUserId: "user-a",
    payer: user(),
    title: "Dinner",
    description: null,
    amount: "100.0000000",
    assetCode: "XLM",
    assetIssuer: null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2024-05-01T12:00:00.000Z",
    shares: [],
    ...overrides,
  };
}

describe("escapeHtml", () => {
  it("encodes the characters that can break out of markup", () => {
    assert.equal(
      escapeHtml(`<img src=x onerror="alert(1)">`),
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
  });

  it("encodes ampersands before other entities", () => {
    assert.equal(escapeHtml("&lt;"), "&amp;lt;");
  });

  it("encodes single quotes so attribute contexts stay closed", () => {
    assert.equal(escapeHtml("it's"), "it&#39;s");
  });

  it("returns an empty string for null and undefined", () => {
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
  });

  it("leaves ordinary text untouched", () => {
    assert.equal(escapeHtml("Ada Lovelace"), "Ada Lovelace");
  });
});

describe("escapeCsv", () => {
  it("prefixes formula triggers with a single quote", () => {
    assert.equal(escapeCsv("=1+1"), "'=1+1");
    assert.equal(escapeCsv("+1"), "'+1");
    assert.equal(escapeCsv("-1"), "'-1");
    assert.equal(escapeCsv("@SUM(A1)"), "'@SUM(A1)");
  });

  it("neutralizes formulas hidden behind leading whitespace control chars", () => {
    assert.equal(escapeCsv("\t=1+1"), '"\'\t=1+1"');
    assert.equal(escapeCsv("\r=1+1"), '"\'\r=1+1"');
  });

  it("quotes and doubles embedded quotes", () => {
    assert.equal(escapeCsv('say "hi", now'), '"say ""hi"", now"');
  });

  it("quotes values containing newlines", () => {
    assert.equal(escapeCsv("a\nb"), '"a\nb"');
  });

  it("leaves ordinary values unquoted", () => {
    assert.equal(escapeCsv("Dinner"), "Dinner");
    assert.equal(escapeCsv(42), "42");
  });

  it("returns an empty string for null and undefined", () => {
    assert.equal(escapeCsv(null), "");
    assert.equal(escapeCsv(undefined), "");
  });
});

describe("isValidTxHash", () => {
  it("accepts a 64-character hex hash", () => {
    assert.equal(isValidTxHash(VALID_HASH), true);
    assert.equal(isValidTxHash(VALID_HASH.toUpperCase()), true);
  });

  it("rejects anything else", () => {
    assert.equal(isValidTxHash(null), false);
    assert.equal(isValidTxHash(""), false);
    assert.equal(isValidTxHash("a".repeat(63)), false);
    assert.equal(isValidTxHash("z".repeat(64)), false);
    assert.equal(isValidTxHash("javascript:alert(1)"), false);
  });
});

describe("buildHistoryCsv", () => {
  it("neutralizes a formula memo on a settlement row", () => {
    const csv = buildHistoryCsv([], [settlement({ memo: "=1+1" })]);
    assert.ok(csv.includes(",'=1+1,"));
    assert.ok(!csv.includes(",=1+1,"));
  });

  it("neutralizes a formula title on an expense row", () => {
    const csv = buildHistoryCsv([expense({ title: "=cmd|' /c calc'!A1" })], []);
    assert.ok(csv.includes(",'=cmd|' /c calc'!A1 (paid by Ada),"));
  });

  it("keeps legitimate rows readable", () => {
    const csv = buildHistoryCsv([], [settlement()]);
    const [header, row] = csv.split("\n");
    assert.equal(
      header,
      "type,date,title_or_parties,amount,asset,status,memo,stellar_tx_hash"
    );
    assert.equal(
      row,
      `settlement,2024-05-01T12:00:00.000Z,Ada -> Grace,12.5000000,XLM,confirmed,Dinner,${VALID_HASH}`
    );
  });
});

describe("buildReceiptHtml", () => {
  it("renders an injected display name as literal text", () => {
    const html = buildReceiptHtml(
      settlement({ from: user({ displayName: `<img src=x onerror=alert(1)>` }) })
    );
    assert.ok(!html.includes("<img src=x"));
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  });

  it("escapes an injected memo", () => {
    const html = buildReceiptHtml(
      settlement({ memo: "</b></div><script>alert(1)</script>" })
    );
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  });

  it("escapes an injected asset code", () => {
    const html = buildReceiptHtml(settlement({ assetCode: `"><script>x</script>` }));
    assert.ok(!html.includes("<script>x</script>"));
  });

  it("only ever contains the trailing print script tag", () => {
    const html = buildReceiptHtml(
      settlement({
        id: "<script>a</script>",
        memo: "<script>b</script>",
        to: user({ displayName: "<script>c</script>" }),
      })
    );
    assert.equal(html.match(/<script/g)?.length, 1);
  });

  it("links the explorer for a well-formed tx hash", () => {
    const html = buildReceiptHtml(settlement());
    assert.ok(html.includes(`/tx/${VALID_HASH}`));
    assert.ok(html.includes('rel="noopener noreferrer"'));
  });

  it("omits the link entirely for a malformed tx hash", () => {
    const html = buildReceiptHtml(
      settlement({ stellarTxHash: `" onmouseover="alert(1)` })
    );
    assert.ok(!html.includes("<a href"));
    assert.ok(!html.includes("onmouseover"));
  });

  it("omits the link when there is no tx hash", () => {
    const html = buildReceiptHtml(settlement({ stellarTxHash: null }));
    assert.ok(!html.includes("<a href"));
  });

  it("keeps a legitimate receipt's values visible", () => {
    const html = buildReceiptHtml(settlement());
    assert.ok(html.includes("12.5000000 XLM"));
    assert.ok(html.includes("<b>Ada</b>"));
    assert.ok(html.includes("<b>Grace</b>"));
    assert.ok(html.includes("<b>Dinner</b>"));
  });

  it("falls back to the raw string for an unparseable date", () => {
    const html = buildReceiptHtml(settlement({ createdAt: "not-a-date" }));
    assert.ok(html.includes("<b>not-a-date</b>"));
  });
});

function share(userId: string, status: ShareStatus, amount: string): ExpenseShare {
  return {
    id: `share-${userId}-${status}`,
    expenseId: "exp-1",
    userId,
    user: user({ id: userId, displayName: userId }),
    shareAmount: amount,
    status,
  };
}

describe("formatExportDate", () => {
  it("formats an ISO instant as YYYY-MM-DD", () => {
    assert.equal(formatExportDate("2024-05-01T12:00:00.000Z"), "2024-05-01");
  });

  it("returns an empty string for unparseable input", () => {
    assert.equal(formatExportDate("not-a-date"), "");
    assert.equal(formatExportDate(null), "");
    assert.equal(formatExportDate(undefined), "");
  });
});

describe("exportSettlementStatus", () => {
  it("maps settled to Settled and everything else to Unsettled", () => {
    assert.equal(exportSettlementStatus("settled"), "Settled");
    assert.equal(exportSettlementStatus("pending"), "Unsettled");
    assert.equal(exportSettlementStatus("settling"), "Unsettled");
    assert.equal(exportSettlementStatus(undefined), "Unsettled");
  });
});

describe("matchesExportStatus", () => {
  const e = (status: ShareStatus) =>
    expense({ shares: [share("me", status, "10.0000000")] });

  it("matches everything for the all filter", () => {
    assert.equal(matchesExportStatus(e("settled"), "me", "all"), true);
    assert.equal(matchesExportStatus(e("pending"), "me", "all"), true);
  });

  it("matches settled shares for the settled filter", () => {
    assert.equal(matchesExportStatus(e("settled"), "me", "settled"), true);
    assert.equal(matchesExportStatus(e("pending"), "me", "settled"), false);
  });

  it("matches non-settled shares for the unsettled filter", () => {
    assert.equal(matchesExportStatus(e("pending"), "me", "unsettled"), true);
    assert.equal(matchesExportStatus(e("settling"), "me", "unsettled"), true);
    assert.equal(matchesExportStatus(e("settled"), "me", "unsettled"), false);
  });

  it("treats an absent share as unsettled", () => {
    assert.equal(matchesExportStatus(e("pending"), "other", "settled"), false);
    assert.equal(matchesExportStatus(e("pending"), "other", "unsettled"), true);
  });
});

describe("matchesExportDateRange", () => {
  const e = () => expense({ createdAt: "2024-05-15T00:00:00.000Z" });

  it("includes everything when no range is set", () => {
    assert.equal(matchesExportDateRange(e(), {}), true);
  });

  it("respects an inclusive start date", () => {
    assert.equal(matchesExportDateRange(e(), { startDate: "2024-05-15" }), true);
    assert.equal(matchesExportDateRange(e(), { startDate: "2024-05-16" }), false);
  });

  it("respects an inclusive end date", () => {
    assert.equal(matchesExportDateRange(e(), { endDate: "2024-05-15" }), true);
    assert.equal(matchesExportDateRange(e(), { endDate: "2024-05-14" }), false);
  });

  it("respects a bounded range", () => {
    assert.equal(
      matchesExportDateRange(e(), { startDate: "2024-05-01", endDate: "2024-05-31" }),
      true
    );
    assert.equal(
      matchesExportDateRange(e(), { startDate: "2024-06-01", endDate: "2024-06-30" }),
      false
    );
  });
});

describe("buildExportFilename", () => {
  it("follows the mergepay-export-{group-id}-{timestamp}.csv pattern", () => {
    const name = buildExportFilename(
      "grp-1",
      new Date("2024-05-01T12:00:00.000Z")
    );
    assert.equal(
      name,
      "mergepay-export-grp-1-2024-05-01T12-00-00-000Z.csv"
    );
  });
});

describe("buildExpenseExportCsv", () => {
  const many = () =>
    expense({
      id: "exp-many",
      title: 'He said "hi", pay up',
      payer: user({ stellarPublicKey: "GBDONALDPAYER" }),
      shares: [share("me", "settled", "33.5000000")],
    });
  const withNewline = () =>
    expense({
      id: "exp-nl",
      title: "line1\nline2",
      payer: user({ displayName: "Ada" }),
      shares: [share("me", "pending", "10.0000000")],
    });
  const formula = () =>
    expense({
      id: "exp-formula",
      title: "=cmd|' /c calc'!A1",
      shares: [share("me", "pending", "5.0000000")],
    });

  it("emits the required header row", () => {
    const header = buildExpenseExportCsv([], "me", { status: "all" }).split(
      "\n"
    )[0];
    assert.equal(
      header,
      "Date,Description,Base Amount,Asset Code,Payer Address,Split Mode,Your Share,Settlement Status"
    );
  });

  it("writes each required column for a normal expense", () => {
    const csv = buildExpenseExportCsv(
      [
        expense({
          createdAt: "2024-05-01T12:00:00.000Z",
          title: "Dinner",
          amount: "100.0000000",
          assetCode: "XLM",
          payer: user({ stellarPublicKey: "GPAYER123" }),
          splitType: "equal",
          shares: [share("me", "settled", "50.0000000")],
        }),
      ],
      "me",
      { status: "all" }
    );
    const [, row] = csv.split("\n");
    assert.equal(
      row,
      "2024-05-01,Dinner,100.0000000,XLM,GPAYER123,equal,50.0000000,Settled"
    );
  });

  it("quotes fields containing commas, quotes and newlines", () => {
    const csv = buildExpenseExportCsv([many(), withNewline()], "me", {
      status: "all",
    });
    // Comma + quote in the title, all cells escaped per RFC 4180.
    assert.ok(csv.includes('"He said ""hi"", pay up"'));
    // Newline in the title is preserved inside quotes.
    assert.ok(csv.includes('"line1\nline2"'));
  });

  it("neutralizes formula prefixes in user-controlled fields", () => {
    const csv = buildExpenseExportCsv([formula()], "me", { status: "all" });
    assert.ok(csv.includes(",'=cmd|' /c calc'!A1,"));
    assert.ok(!csv.includes(",=cmd|' /c calc'"));
  });

  it("filters rows by settlement status based on the current user's share", () => {
    const csv = buildExpenseExportCsv(
      [
        expense({ id: "a", shares: [share("me", "settled", "1.0000000")] }),
        expense({ id: "b", shares: [share("me", "pending", "2.0000000")] }),
      ],
      "me",
      { status: "settled" }
    );
    const dataRows = csv.split("\n").slice(1);
    assert.equal(dataRows.length, 1);
    assert.ok(dataRows[0].includes("Settled"));
    assert.ok(!dataRows[0].includes("Unsettled"));
  });

  it("filters rows by status for unsettled", () => {
    const csv = buildExpenseExportCsv(
      [
        expense({ id: "a", shares: [share("me", "settled", "1.0000000")] }),
        expense({ id: "b", shares: [share("me", "pending", "2.0000000")] }),
      ],
      "me",
      { status: "unsettled" }
    );
    const dataRows = csv.split("\n").slice(1);
    assert.equal(dataRows.length, 1);
    assert.ok(dataRows[0].includes("Unsettled"));
  });

  it("filters rows by the selected date range", () => {
    const csv = buildExpenseExportCsv(
      [
        expense({
          id: "early",
          createdAt: "2024-01-01T00:00:00.000Z",
          shares: [share("me", "settled", "1.0000000")],
        }),
        expense({
          id: "late",
          createdAt: "2024-12-01T00:00:00.000Z",
          shares: [share("me", "settled", "2.0000000")],
        }),
      ],
      "me",
      { status: "all", startDate: "2024-06-01", endDate: "2024-12-31" }
    );
    const dataRows = csv.split("\n").slice(1);
    assert.equal(dataRows.length, 1);
    assert.ok(dataRows[0].includes("2024-12-01"));
  });

  it("sorts rows oldest-first", () => {
    const csv = buildExpenseExportCsv(
      [
        expense({
          id: "b",
          createdAt: "2024-05-01T00:00:00.000Z",
          shares: [share("me", "settled", "1.0000000")],
        }),
        expense({
          id: "a",
          createdAt: "2024-01-01T00:00:00.000Z",
          shares: [share("me", "settled", "2.0000000")],
        }),
      ],
      "me",
      { status: "all" }
    );
    const rows = csv.split("\n").slice(1);
    assert.equal(rows[0].startsWith("2024-01-01"), true);
    assert.equal(rows[1].startsWith("2024-05-01"), true);
  });

  it("produces RFC 4180 well-formed output with a trailing balanced quote set", () => {
    const csv = buildExpenseExportCsv([many(), formula(), withNewline()], "me", {
      status: "all",
    });
    // Split into records honoring newlines that are embedded inside quoted
    // fields — a naive `.split("\n")` would break a multi-line cell in two.
    const records = splitCsvRecords(csv);
    // Header + one record per expense.
    assert.equal(records.length, 4);
    const dataRows = records.slice(1);
    // Every record has the same number of columns.
    const rowCounts = dataRows.map(countCsvColumns);
    assert.ok(rowCounts.every((n) => n === 8));
    // Each record is individually declosable (no dangling opening quote).
    for (const row of dataRows) assert.equal(hasBalancedQuotes(row), true);
  });
});

/** Split a full CSV into records, honoring newlines inside quoted fields. */
function splitCsvRecords(csv: string): string[] {
  const records: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"' && csv[i + 1] === '"') {
      current += ch;
      current += csv[i + 1];
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "\n" && !inQuotes) {
      records.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.length > 0) records.push(current);
  return records;
}

/** True when no field is left inside an unclosed quote. */
function hasBalancedQuotes(row: string): boolean {
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '"' && row[i + 1] === '"') {
      i++;
      continue;
    }
    if (row[i] === '"') inQuotes = !inQuotes;
  }
  return !inQuotes;
}

/** Count top-level columns of an RFC 4180 row honoring quoted fields. */
function countCsvColumns(row: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"' && row[i + 1] === '"') {
      i++;
      continue;
    }
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) count++;
  }
  return count + 1;
}
