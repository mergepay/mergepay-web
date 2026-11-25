/**
 * Unit tests for the expense memo helpers added for #541.
 *
 * Covers the three things the issue asks for:
 *   - `formatExpenseMemo` — constructing an `MP:<code>` memo from an expense
 *   - `parseExpenseMemo` — validating and decomposing one
 *   - `expenseMemoSchema` / `EXPENSE_MEMO_REGEX` — Zod + regex acceptance
 *
 * The edge cases that matter are the ones the Stellar ledger enforces rather
 * than the app: the 28-byte ceiling is measured in UTF-8 bytes (so a
 * three-byte codepoint counts three times), and the reconciliation code has to
 * survive a round trip through `generateShortCode`, which always emits a
 * hyphen before its hash suffix.
 *
 * Runner: vitest (`*.vitest.test.ts` include pattern in vitest.config.ts).
 * Execute: npm test
 */

import { describe, expect, it } from "vitest";
import {
  EXPENSE_MEMO_REGEX,
  MAX_SHORT_CODE_BYTES,
  PREFIX_BYTES,
  STELLAR_MEMO_MAX_BYTES,
  buildSettlementMemo,
  expenseMemoSchema,
  formatExpenseMemo,
  generateShortCode,
  parseExpenseMemo,
  parseSettlementMemo,
  validateMemo,
} from "./memoValidation";
import { isValidMergepayMemo } from "./memo";
import type { Expense } from "./types";

const CODE = "dinner-8f3a";
const MEMO = `MP:${CODE}`;

describe("EXPENSE_MEMO_REGEX", () => {
  it("accepts the memo convention the app actually generates", () => {
    expect(EXPENSE_MEMO_REGEX.test(MEMO)).toBe(true);
    expect(EXPENSE_MEMO_REGEX.test("MP:settle")).toBe(true);
    expect(EXPENSE_MEMO_REGEX.test("MP:Rent_2")).toBe(true);
    expect(EXPENSE_MEMO_REGEX.test("MP:a")).toBe(true);
  });

  it("accepts the hyphen that generateShortCode always inserts", () => {
    // #541 spells the format `MP:[a-zA-Z0-9]+`. Taken literally that rejects
    // every code this repository produces, so the alphabet also allows the
    // separators — pinned here because it is a deliberate reading of the spec.
    const code = generateShortCode("Dinner", "42.00");
    expect(code).toContain("-");
    expect(EXPENSE_MEMO_REGEX.test(buildSettlementMemo(code)!)).toBe(true);
  });

  it("rejects everything that is not a well-formed code", () => {
    const rejected = [
      "",
      "MP:",
      "MP",
      "MP:-leading-separator",
      "MP:embedded space",
      "MP:double--dash?",
      "MP:taxé",
      "MP:dinner\ttab",
      "MP:dinner\x00null",
      "mp:lowercase-prefix",
      "note:dinner",
    ];
    for (const memo of rejected) {
      expect(EXPENSE_MEMO_REGEX.test(memo), memo).toBe(false);
    }
  });

  it("bounds the alphabet only; the byte ceiling belongs to the ledger checks", () => {
    // A 40-character code matches the regex but cannot be a Stellar memo, so
    // format and parse both have to enforce the length separately.
    const long = "MP:" + "a".repeat(40);
    expect(EXPENSE_MEMO_REGEX.test(long)).toBe(true);
    expect(parseExpenseMemo(long).valid).toBe(false);
    expect(formatExpenseMemo({ shortCode: long.slice(3) })).toBeNull();
  });
});

describe("expenseMemoSchema", () => {
  it("accepts a valid settlement memo", () => {
    expect(expenseMemoSchema.safeParse(MEMO).success).toBe(true);
    expect(expenseMemoSchema.safeParse("MP:rent-2024-07").success).toBe(true);
  });

  it("rejects a memo that fails the structure, with a message that names it", () => {
    const bad = expenseMemoSchema.safeParse("dinner-8f3a");
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues[0].message).toContain("MP:");
    }
  });

  it("inherits the Stellar byte limit from stellarTextMemoSchema", () => {
    const atLimit = "MP:" + "a".repeat(MAX_SHORT_CODE_BYTES);
    expect(new TextEncoder().encode(atLimit).length).toBe(STELLAR_MEMO_MAX_BYTES);
    expect(expenseMemoSchema.safeParse(atLimit).success).toBe(true);

    const over = expenseMemoSchema.safeParse(atLimit + "a");
    expect(over.success).toBe(false);
    if (!over.success) {
      expect(over.error.issues[0].message).toContain(
        `${STELLAR_MEMO_MAX_BYTES} bytes`
      );
    }
  });

  it("rejects an empty memo and control characters", () => {
    expect(expenseMemoSchema.safeParse("").success).toBe(false);
    expect(expenseMemoSchema.safeParse("MP:d\x00nner").success).toBe(false);
  });

  it("counts UTF-8 bytes, not characters", () => {
    // 9 three-byte codepoints after the prefix is 30 bytes — over the ledger
    // limit — while remaining only 12 characters long.
    const memo = "MP:" + "日".repeat(9);
    expect(memo.length).toBeLessThan(STELLAR_MEMO_MAX_BYTES);
    expect(new TextEncoder().encode(memo).length).toBeGreaterThan(
      STELLAR_MEMO_MAX_BYTES
    );
    expect(expenseMemoSchema.safeParse(memo).success).toBe(false);
  });
});

describe("formatExpenseMemo", () => {
  it("builds a memo from an existing short code", () => {
    expect(formatExpenseMemo({ shortCode: CODE })).toBe(MEMO);
  });

  it("tolerates whitespace and an already-present prefix in the source", () => {
    expect(formatExpenseMemo({ shortCode: `  ${CODE}  ` })).toBe(MEMO);
    expect(formatExpenseMemo({ memo: MEMO })).toBe(MEMO);
    expect(formatExpenseMemo({ memo: `  ${MEMO} ` })).toBe(MEMO);
    // An explicit short code wins over a stale memo on the expense.
    expect(formatExpenseMemo({ shortCode: "dinner", memo: MEMO })).toBe("MP:dinner");
  });

  it("derives a deterministic code from the expense name and amount", () => {
    const first = formatExpenseMemo({ title: "Grocery run", amount: "42.00" });
    const second = formatExpenseMemo({ label: "Grocery run", amount: "42.00" });
    expect(first).toBe(second);
    expect(first).toBe(buildSettlementMemo(generateShortCode("Grocery run", "42.00")));

    // Same name, different amount → different code, so two expenses of the
    // same title still reconcile separately.
    expect(formatExpenseMemo({ title: "Grocery run", amount: "43.00" })).not.toBe(first);
  });

  it("prefers the name source that is present", () => {
    expect(formatExpenseMemo({ title: "Rent", label: "Utilities", amount: "1" })).toBe(
      formatExpenseMemo({ label: "Utilities", amount: "1" })
    );
    expect(formatExpenseMemo({ title: "Rent", amount: "1" })).toBe(
      formatExpenseMemo({ label: "Rent", amount: "1" })
    );
  });

  it("accepts a whole Expense, matching the fields on the domain type", () => {
    const expense = {
      title: "Flight tickets",
      amount: "350.99",
      memo: null,
    } as Expense;
    const memo = formatExpenseMemo(expense);
    expect(memo).toBe(buildSettlementMemo(generateShortCode("Flight tickets", "350.99")));
    expect(parseExpenseMemo(memo).valid).toBe(true);
  });

  it("returns null instead of throwing when there is nothing to reconcile", () => {
    expect(formatExpenseMemo(undefined)).toBeNull();
    expect(formatExpenseMemo(null)).toBeNull();
    expect(formatExpenseMemo({})).toBeNull();
    expect(formatExpenseMemo({ amount: "12.00" })).toBeNull();
    expect(formatExpenseMemo({ shortCode: "   ", label: "   " })).toBeNull();
    expect(formatExpenseMemo({ shortCode: null, label: null })).toBeNull();
  });

  it("returns null for a code the ledger or the alphabet refuses", () => {
    // Over the 25-byte code budget.
    expect(formatExpenseMemo({ shortCode: "a".repeat(MAX_SHORT_CODE_BYTES + 1) })).toBeNull();
    // Valid bytes, invalid characters.
    expect(formatExpenseMemo({ shortCode: "dinner 8f3a" })).toBeNull();
    expect(formatExpenseMemo({ shortCode: "-leading" })).toBeNull();
    expect(formatExpenseMemo({ shortCode: "taxé" })).toBeNull();
    // An embedded prefix would produce "MP:MP:...".
    expect(formatExpenseMemo({ shortCode: "MP:dinner" })).toBeNull();
  });

  it("still produces a code when the name slugs down to nothing", () => {
    // generateShortCode falls back to the "settle" slug, which reconciles fine.
    expect(formatExpenseMemo({ label: "///", amount: "1" })).toBe(
      buildSettlementMemo(generateShortCode("///", "1"))
    );
    expect(formatExpenseMemo({ label: "///", amount: "1" })).toBe("MP:settle-0031");
  });

  it("stays inside the ledger limit for a long name", () => {
    const memo = formatExpenseMemo({ title: "a".repeat(200), amount: "10.00" })!;
    expect(new TextEncoder().encode(memo).length).toBeLessThanOrEqual(
      STELLAR_MEMO_MAX_BYTES
    );
    expect(validateMemo(memo).valid).toBe(true);
  });

  it("produces a memo every other memo validator accepts", () => {
    const sources = [
      { title: "Monthly rent", amount: "1500.00" },
      { title: "Coffee & snacks", amount: "8.50" },
      { title: "Utilities", amount: 120 },
      { shortCode: "trip-7" },
    ];
    for (const source of sources) {
      const memo = formatExpenseMemo(source);
      expect(memo, JSON.stringify(source)).not.toBeNull();
      expect(isValidMergepayMemo(memo)).toBe(true);
      expect(parseSettlementMemo(memo).valid).toBe(true);
      expect(expenseMemoSchema.safeParse(memo).success).toBe(true);
    }
  });
});

describe("parseExpenseMemo", () => {
  it("decomposes a valid memo into prefix and code", () => {
    const parsed = parseExpenseMemo(MEMO);
    expect(parsed).toEqual({
      valid: true,
      prefix: "MP:",
      shortCode: CODE,
      byteLength: MEMO.length,
    });
    expect(parsed.error).toBeUndefined();
  });

  it("trims surrounding whitespace before validating", () => {
    expect(parseExpenseMemo(`  ${MEMO}  `).shortCode).toBe(CODE);
    expect(parseExpenseMemo(`  ${MEMO}  `).valid).toBe(true);
  });

  it("explains a missing memo", () => {
    for (const raw of [undefined, null, "", "   "]) {
      const parsed = parseExpenseMemo(raw);
      expect(parsed.valid).toBe(false);
      expect(parsed.byteLength).toBe(0);
      expect(parsed.error).toContain("required");
    }
  });

  it("reports the byte length of an over-long memo", () => {
    const raw = "MP:" + "a".repeat(MAX_SHORT_CODE_BYTES + 1);
    const parsed = parseExpenseMemo(raw);
    expect(parsed.valid).toBe(false);
    expect(parsed.byteLength).toBe(raw.length);
    expect(parsed.error).toContain(`${STELLAR_MEMO_MAX_BYTES} bytes`);
    expect(parsed.error).toContain(`${raw.length} bytes`);
  });

  it("names the prefix when it is missing", () => {
    const parsed = parseExpenseMemo("dinner-8f3a");
    expect(parsed.valid).toBe(false);
    expect(parsed.error).toContain("MP:");
  });

  it("distinguishes the three ways a code can be malformed", () => {
    expect(parseExpenseMemo("MP:").error).toContain("no reconciliation code");
    expect(parseExpenseMemo("MP:-dinner").error).toContain("letter or digit");
    expect(parseExpenseMemo("MP:dinner 8f3a").error).toContain("characters");
  });

  it("rejects multi-byte and control characters in the code", () => {
    expect(parseExpenseMemo("MP:dé").valid).toBe(false);
    expect(parseExpenseMemo("MP:dinner\x00").valid).toBe(false);
    expect(parseExpenseMemo("MP:dinner\textra").valid).toBe(false);
  });

  it("handles the exact 28-byte boundary", () => {
    const atLimit = "MP:" + "z".repeat(MAX_SHORT_CODE_BYTES);
    expect(new TextEncoder().encode(atLimit).length).toBe(STELLAR_MEMO_MAX_BYTES);
    expect(parseExpenseMemo(atLimit).valid).toBe(true);

    const overLimit = atLimit + "z";
    expect(parseExpenseMemo(overLimit).valid).toBe(false);
  });

  it("agrees with the byte limit that validateMemo enforces", () => {
    for (const raw of ["MP:a", MEMO, "MP:", "dinner", "MP:dinner 8f3a"]) {
      expect(parseExpenseMemo(raw).valid, raw).toBe(
        validateMemo(raw).valid && EXPENSE_MEMO_REGEX.test(raw.trim())
      );
    }
  });
});

describe("formatExpenseMemo → parseExpenseMemo round trip", () => {
  it("reconstructs the code it started from", () => {
    const sources = [
      { shortCode: CODE },
      { title: "Team dinner", amount: "88.00" },
      { title: "Taxes 2026 (Q3)", amount: "1234.5678" },
      { label: "Airbnb", amount: 0 },
    ];
    for (const source of sources) {
      const memo = formatExpenseMemo(source);
      expect(memo, JSON.stringify(source)).not.toBeNull();
      const parsed = parseExpenseMemo(memo);
      expect(parsed.valid, String(memo)).toBe(true);
      expect(parsed.prefix).toBe("MP:");
      expect(parsed.byteLength).toBe(new TextEncoder().encode(memo!).length);
      expect(PREFIX_BYTES + parsed.shortCode!.length).toBe(parsed.byteLength);
      expect(formatExpenseMemo({ shortCode: parsed.shortCode })).toBe(memo);
    }
  });
});
