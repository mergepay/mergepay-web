import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateShortCode,
  buildSettlementMemo,
  isValidMergepayMemo,
  verifyTransactionMemo,
  validateMemo,
  validateShortCode,
  detectMemoDeviations,
  formatExpenseMemo,
  parseExpenseMemo,
  stellarTextMemoSchema,
  mergepaySettlementMemoSchema,
  STELLAR_MEMO_MAX_BYTES,
  PREFIX_BYTES,
  MAX_SHORT_CODE_BYTES,
  SETTLEMENT_MEMO_PREFIX,
} from "../memo";

describe("Memo Formatting and Verification Utilities (#633)", () => {
  describe("Stellar ledger byte constraints", () => {
    it("adheres strictly to 28-byte maximum for Stellar text memos", () => {
      assert.equal(STELLAR_MEMO_MAX_BYTES, 28);
      assert.equal(PREFIX_BYTES, 3);
      assert.equal(MAX_SHORT_CODE_BYTES, 25);
      assert.equal(PREFIX_BYTES + MAX_SHORT_CODE_BYTES, 28);
    });

    it("verifies byte lengths with UTF-8 multi-byte characters", () => {
      const emojiMemo = "MP:🍕";
      const bytes = new TextEncoder().encode(emojiMemo).length;
      assert.equal(bytes, 7);
      assert.equal(isValidMergepayMemo(emojiMemo), false);
    });
  });

  describe("generateShortCode", () => {
    const cases = [
      ["Dinner", "50.00", "dinner"],
      ["Groceries & Snacks", "120.50", "groceries-snacks"],
      ["TEAM LUNCH", "15.00", "team-lunch"],
      ["Uber Ride - Downtown", "25.00", "uber-ride-downtown"],
    ] as const;

    for (const [title, amount, expectedSlugPrefix] of cases) {
      it(`generates deterministic shortcode with prefix for '${title}'`, () => {
        const code1 = generateShortCode(title, amount);
        const code2 = generateShortCode(title, amount);
        assert.equal(code1, code2);
        assert.ok(code1.startsWith(expectedSlugPrefix.slice(0, 15)));
        assert.match(code1, /^[a-z0-9-]+-[0-9a-f]{4}$/);
        assert.ok(code1.length <= MAX_SHORT_CODE_BYTES);
      });
    }

    it("produces distinct codes when amount changes for same title", () => {
      const code1 = generateShortCode("Movie Night", "20.00");
      const code2 = generateShortCode("Movie Night", "25.00");
      assert.notEqual(code1, code2);
    });

    it("handles special characters and punctuation by sanitizing", () => {
      const code = generateShortCode("Coffee! @#$%^&*() / 123", "4.50");
      assert.match(code, /^[a-z0-9-]+$/);
      assert.ok(code.length <= MAX_SHORT_CODE_BYTES);
    });

    it("falls back to 'settle' when title consists entirely of special characters", () => {
      const code = generateShortCode("!@#$%^&*()_+", "10.00");
      assert.match(code, /^settle-[0-9a-f]{4}$/);
    });

    it("falls back to 'settle' when title is empty or whitespace", () => {
      const code1 = generateShortCode("", "10.00");
      const code2 = generateShortCode("   ", "10.00");
      assert.match(code1, /^settle-[0-9a-f]{4}$/);
      assert.match(code2, /^settle-[0-9a-f]{4}$/);
    });

    it("truncates long titles to keep total shortcode within 25 bytes", () => {
      const longTitle = "Super Long Vacation Trip to the Alps with Extended Family and Friends 2026";
      const code = generateShortCode(longTitle, "5000.00");
      assert.ok(code.length <= MAX_SHORT_CODE_BYTES);
      const fullMemo = buildSettlementMemo(code);
      assert.notEqual(fullMemo, null);
      assert.ok(new TextEncoder().encode(fullMemo!).length <= STELLAR_MEMO_MAX_BYTES);
    });
  });

  describe("buildSettlementMemo", () => {
    it("prepends MP: to valid short codes", () => {
      assert.equal(buildSettlementMemo("dinner-8f3a"), "MP:dinner-8f3a");
    });

    it("returns null for empty or whitespace short code", () => {
      assert.equal(buildSettlementMemo(""), null);
      assert.equal(buildSettlementMemo("   "), null);
    });

    it("returns null if short code exceeds MAX_SHORT_CODE_BYTES (25)", () => {
      const tooLongCode = "a".repeat(26);
      assert.equal(buildSettlementMemo(tooLongCode), null);
    });

    it("returns null if short code has leading or trailing whitespace", () => {
      assert.equal(buildSettlementMemo(" dinner-8f3a"), null);
      assert.equal(buildSettlementMemo("dinner-8f3a "), null);
    });

    it("returns null if short code contains control characters", () => {
      assert.equal(buildSettlementMemo("dinner\x008f3a"), null);
      assert.equal(buildSettlementMemo("dinner\x1f8f3a"), null);
    });

    it("returns null if short code already contains MP: prefix", () => {
      assert.equal(buildSettlementMemo("MP:dinner-8f3a"), null);
    });
  });

  describe("isValidMergepayMemo", () => {
    const memoCases: [string | null | undefined, boolean][] = [
      ["MP:dinner-8f3a", true],
      ["MP:a", true],
      ["MP:123456", true],
      ["MP:valid-code-1234567890", true],
      ["MP:a-b-c-d-e", true],
      ["", false],
      [null, false],
      [undefined, false],
      ["   ", false],
      ["dinner-8f3a", false],
      ["MP:", false],
      ["mp:dinner-8f3a", false],
      ["M:dinner-8f3a", false],
      ["P:dinner-8f3a", false],
      ["MP:dinner_8f3a", false],
      ["MP:dinner 8f3a", false],
      [`MP:${"a".repeat(26)}`, false],
    ];

    for (const [memo, expected] of memoCases) {
      it(`validates '${memo}' as ${expected}`, () => {
        assert.equal(isValidMergepayMemo(memo), expected);
      });
    }
  });

  describe("verifyTransactionMemo", () => {
    it("handles missing or empty memo with 'missing' severity", () => {
      const res1 = verifyTransactionMemo(null, "dinner-8f3a");
      assert.equal(res1.isValid, false);
      assert.equal(res1.severity, "missing");
      assert.equal(res1.title, "Missing Settlement Memo");
      assert.equal(res1.suggestedMemo, "MP:dinner-8f3a");

      const res2 = verifyTransactionMemo("", "lunch-1234");
      assert.equal(res2.isValid, false);
      assert.equal(res2.severity, "missing");
      assert.equal(res2.suggestedMemo, "MP:lunch-1234");
    });

    it("flags byte length overflow (>28 bytes)", () => {
      const overLengthMemo = "MP:very-long-reconciliation-code-that-exceeds-limit";
      const res = verifyTransactionMemo(overLengthMemo);
      assert.equal(res.isValid, false);
      assert.equal(res.severity, "invalid_length");
      assert.equal(res.title, "Memo Exceeds Stellar Limit");
      assert.ok(res.byteLength > 28);
    });

    it("flags missing prefix with 'malformed' severity", () => {
      const res = verifyTransactionMemo("dinner-8f3a", "dinner-8f3a");
      assert.equal(res.isValid, false);
      assert.equal(res.severity, "malformed");
      assert.equal(res.title, "Unrecognized Memo Format");
      assert.ok(res.message.includes(SETTLEMENT_MEMO_PREFIX));
    });

    it("flags empty reconciliation code with 'malformed' severity", () => {
      const res = verifyTransactionMemo("MP:");
      assert.equal(res.isValid, false);
      assert.equal(res.severity, "malformed");
      assert.equal(res.title, "Empty Reconciliation Code");
    });

    it("flags invalid characters in code with 'malformed' severity", () => {
      const res = verifyTransactionMemo("MP:dinner_party!");
      assert.equal(res.isValid, false);
      assert.equal(res.severity, "malformed");
      assert.equal(res.title, "Invalid Memo Characters");
    });

    it("detects deviation from expected short code with 'deviation' severity", () => {
      const res = verifyTransactionMemo("MP:lunch-9999", "dinner-8f3a");
      assert.equal(res.isValid, true);
      assert.equal(res.severity, "deviation");
      assert.equal(res.title, "Reconciliation Code Mismatch");
      assert.ok(res.message.includes("lunch-9999"));
      assert.equal(res.suggestedMemo, "MP:dinner-8f3a");
    });

    it("returns 'none' severity for fully valid matching memo", () => {
      const res = verifyTransactionMemo("MP:dinner-8f3a", "dinner-8f3a");
      assert.equal(res.isValid, true);
      assert.equal(res.severity, "none");
      assert.equal(res.title, "Valid Settlement Memo");
      assert.equal(res.byteLength, 14);
    });
  });

  describe("formatExpenseMemo and parseExpenseMemo", () => {
    it("round-trips expense memo serialization and parsing", () => {
      const memo = formatExpenseMemo({ title: "Dinner", amount: "50.00" });
      assert.notEqual(memo, null);
      assert.ok(new TextEncoder().encode(memo!).length <= STELLAR_MEMO_MAX_BYTES);

      const parsed = parseExpenseMemo(memo!);
      assert.notEqual(parsed, null);
    });
  });

  describe("detectMemoDeviations", () => {
    it("returns empty warnings when memo codes match identically", () => {
      const warnings = detectMemoDeviations("MP:dinner-8f3a", "dinner-8f3a");
      assert.deepEqual(warnings, []);
    });

    it("detects when prefix is missing in actual memo", () => {
      const warnings = detectMemoDeviations("dinner-8f3a", "dinner-8f3a");
      assert.ok(warnings.length > 0);
      assert.ok(warnings.some((w) => w.includes('Memo does not start with "MP:"')));
    });

    it("detects code mismatch", () => {
      const warnings = detectMemoDeviations("MP:lunch-1234", "dinner-8f3a");
      assert.ok(warnings.length > 0);
      assert.ok(warnings.some((w) => w.includes("Manual memo edits")));
    });
  });

  describe("Zod schemas for Stellar and Mergepay memos", () => {
    it("stellarTextMemoSchema validates string byte length <= 28", () => {
      assert.equal(stellarTextMemoSchema.safeParse("Valid memo").success, true);
      assert.equal(stellarTextMemoSchema.safeParse("a".repeat(28)).success, true);
      assert.equal(stellarTextMemoSchema.safeParse("a".repeat(29)).success, false);
    });

    it("mergepaySettlementMemoSchema validates MP: prefix and code format", () => {
      assert.equal(mergepaySettlementMemoSchema.safeParse("MP:settle-1234").success, true);
      assert.equal(mergepaySettlementMemoSchema.safeParse("settle-1234").success, false);
      assert.equal(mergepaySettlementMemoSchema.safeParse("MP:").success, false);
    });
  });
});
