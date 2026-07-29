import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildHistoryCsv,
  buildReceiptHtml,
  escapeCsv,
  escapeHtml,
  isValidTxHash,
} from "../export";
import type { Expense, Settlement, User } from "../types";

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
