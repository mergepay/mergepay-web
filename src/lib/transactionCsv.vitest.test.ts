import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TRANSACTION_CSV_HEADERS,
  buildTransactionCsv,
  buildTransactionCsvFilename,
  downloadCsv,
  historyItemToCsvRecord,
  toCsvField,
  type HistoryExportItem,
} from "./transactionCsv";
import type { Expense, Settlement, User } from "./types";

const ALICE_KEY = "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3IF5WDMWGMED";
const BOB_KEY = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

function user(id: string, displayName: string, key = ""): User {
  return { id, displayName, stellarPublicKey: key, avatarUrl: null, createdAt: "2026-01-01T00:00:00.000Z" };
}

const alice = user("u1", "Alice", ALICE_KEY);
const bob = user("u2", "Bob", BOB_KEY);
const carol = user("u3", "Carol");

function settlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    id: "s1",
    groupId: "g1",
    fromUserId: alice.id,
    from: alice,
    toUserId: bob.id,
    to: bob,
    amount: "12.5000000",
    assetCode: "USDC",
    assetIssuer: null,
    stellarTxHash: null,
    status: "confirmed",
    memo: "MP:abc123",
    expenseId: null,
    createdAt: "2026-03-01T10:00:00.000Z",
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    groupId: "g1",
    payerUserId: alice.id,
    payer: alice,
    title: "Dinner",
    description: null,
    amount: "30",
    assetCode: "XLM",
    assetIssuer: null,
    splitType: "equal",
    memo: "MP:dinner",
    receiptUrl: null,
    createdAt: "2026-02-01T19:30:00.000Z",
    shares: [alice, bob, carol].map((u, i) => ({
      id: `sh${i}`,
      expenseId: "e1",
      userId: u.id,
      user: u,
      shareAmount: "10",
      status: "pending" as const,
    })),
    ...overrides,
  };
}

/** Minimal RFC 4180 parser used to round-trip the generated output. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r" && text[i + 1] === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

describe("toCsvField", () => {
  it("leaves plain values unquoted", () => {
    expect(toCsvField("XLM")).toBe("XLM");
    expect(toCsvField("12.5")).toBe("12.5");
    expect(toCsvField(7)).toBe("7");
  });

  it("renders null and undefined as empty fields", () => {
    expect(toCsvField(null)).toBe("");
    expect(toCsvField(undefined)).toBe("");
  });

  it("quotes commas, quotes and line breaks and doubles embedded quotes", () => {
    expect(toCsvField("a,b")).toBe('"a,b"');
    expect(toCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(toCsvField("line1\nline2")).toBe('"line1\nline2"');
    expect(toCsvField("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("quotes values with leading or trailing whitespace", () => {
    expect(toCsvField(" padded ")).toBe('" padded "');
  });

  it("neutralises spreadsheet formula prefixes", () => {
    expect(toCsvField("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(toCsvField("+1+1")).toBe("'+1+1");
    expect(toCsvField("@cmd")).toBe("'@cmd");
    expect(toCsvField("-cmd|' /C calc'!A0")).toBe("'-cmd|' /C calc'!A0");
  });

  it("keeps negative plain numbers numeric", () => {
    expect(toCsvField("-5.25")).toBe("-5.25");
  });

  it("handles unicode and emoji without mangling", () => {
    expect(toCsvField("Zoë 🍕")).toBe("Zoë 🍕");
  });
});

describe("historyItemToCsvRecord", () => {
  it("maps a settlement's sender, receiver, memo, asset and amount", () => {
    expect(historyItemToCsvRecord({ type: "settlement", item: settlement() })).toEqual({
      Timestamp: "2026-03-01T10:00:00.000Z",
      Type: "settlement",
      Memo: "MP:abc123",
      Sender: `Alice (${ALICE_KEY})`,
      Receiver: `Bob (${BOB_KEY})`,
      Asset: "USDC",
      Amount: "12.5000000",
    });
  });

  it("lists every non-payer participant as receivers of an expense", () => {
    const record = historyItemToCsvRecord({ type: "expense", item: expense() });
    expect(record.Sender).toBe(`Alice (${ALICE_KEY})`);
    expect(record.Receiver).toBe(`Bob (${BOB_KEY}); Carol`);
    expect(record.Memo).toBe("MP:dinner");
  });

  it("writes an empty memo when none was attached", () => {
    expect(historyItemToCsvRecord({ type: "settlement", item: settlement({ memo: null }) }).Memo).toBe("");
  });
});

describe("buildTransactionCsv", () => {
  it("produces just the header row for an empty dataset", () => {
    const csv = buildTransactionCsv([]);
    expect(csv).toBe(`${TRANSACTION_CSV_HEADERS.join(",")}\r\n`);
    expect(parseCsv(csv)).toEqual([[...TRANSACTION_CSV_HEADERS]]);
  });

  it("uses CRLF record separators", () => {
    const csv = buildTransactionCsv([{ type: "settlement", item: settlement() }]);
    expect(csv.split("\r\n")).toHaveLength(3); // header, row, trailing empty
    expect(csv.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("includes the required columns", () => {
    const [header] = parseCsv(buildTransactionCsv([]));
    for (const col of ["Timestamp", "Memo", "Sender", "Receiver", "Asset", "Amount"]) {
      expect(header).toContain(col);
    }
  });

  it("round-trips special characters through an RFC 4180 parser", () => {
    const tricky = user("u9", 'Dan "The Man", Jr.\nSecond line');
    const items: HistoryExportItem[] = [
      { type: "settlement", item: settlement({ memo: "MP:a,b", to: tricky }) },
      { type: "expense", item: expense() },
    ];
    const rows = parseCsv(buildTransactionCsv(items));
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toHaveLength(TRANSACTION_CSV_HEADERS.length);
    expect(rows[1][2]).toBe("MP:a,b");
    expect(rows[1][4]).toBe('Dan "The Man", Jr.\nSecond line');
  });

  it("keeps the order of the filtered items it was given", () => {
    const rows = parseCsv(
      buildTransactionCsv([
        { type: "expense", item: expense() },
        { type: "settlement", item: settlement() },
      ])
    );
    expect(rows.slice(1).map((r) => r[1])).toEqual(["expense", "settlement"]);
  });
});

describe("buildTransactionCsvFilename", () => {
  const now = new Date("2026-11-24T12:00:00.000Z");

  it("names unfiltered exports by date", () => {
    expect(buildTransactionCsvFilename({ now })).toBe("mergepay-transactions-2026-11-24.csv");
    expect(buildTransactionCsvFilename({ now, assetCode: "ALL" })).toBe("mergepay-transactions-2026-11-24.csv");
  });

  it("encodes active asset and date filters", () => {
    expect(
      buildTransactionCsvFilename({ now, assetCode: "USDC", startDate: "2026-01-01", endDate: "2026-03-31" })
    ).toBe("mergepay-transactions-2026-11-24-USDC-from-2026-01-01-to-2026-03-31.csv");
  });

  it("strips unsafe characters", () => {
    expect(buildTransactionCsvFilename({ now, assetCode: "../X/LM" })).toBe("mergepay-transactions-2026-11-24-XLM.csv");
  });
});

describe("downloadCsv", () => {
  afterEach(() => vi.restoreAllMocks());

  it("downloads through a Blob object URL and revokes it", async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadCsv("a,b\r\n", "out.csv");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe("out.csv");
    expect(document.querySelector("a[download]")).toBeNull();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    vi.useRealTimers();
  });
});
