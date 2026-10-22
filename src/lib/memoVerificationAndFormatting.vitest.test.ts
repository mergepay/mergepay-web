import { describe, it, expect } from "vitest";
import {
  generateShortCode,
  buildSettlementMemo,
  isValidMergepayMemo,
  verifyTransactionMemo,
  detectMemoDeviations,
  formatExpenseMemo,
  parseExpenseMemo,
  stellarTextMemoSchema,
  mergepaySettlementMemoSchema,
  STELLAR_MEMO_MAX_BYTES,
  PREFIX_BYTES,
  MAX_SHORT_CODE_BYTES,
  SETTLEMENT_MEMO_PREFIX,
} from "./memo";

describe("Memo Formatting and Verification Utilities Vitest Suite (#633)", () => {
  describe("Stellar ledger byte constraints", () => {
    it("adheres strictly to 28-byte maximum for Stellar text memos", () => {
      expect(STELLAR_MEMO_MAX_BYTES).toBe(28);
      expect(PREFIX_BYTES).toBe(3);
      expect(MAX_SHORT_CODE_BYTES).toBe(25);
      expect(PREFIX_BYTES + MAX_SHORT_CODE_BYTES).toBe(28);
    });

    it("verifies byte lengths with UTF-8 multi-byte characters", () => {
      const emojiMemo = "MP:🍕";
      const bytes = new TextEncoder().encode(emojiMemo).length;
      expect(bytes).toBe(7);
      expect(isValidMergepayMemo(emojiMemo)).toBe(false);
    });
  });

  describe("generateShortCode", () => {
    it.each([
      ["Dinner", "50.00", "dinner"],
      ["Groceries & Snacks", "120.50", "groceries-snacks"],
      ["TEAM LUNCH", "15.00", "team-lunch"],
      ["Uber Ride - Downtown", "25.00", "uber-ride-downtown"],
    ])("generates deterministic shortcode with prefix for '%s'", (title, amount, expectedSlugPrefix) => {
      const code1 = generateShortCode(title, amount);
      const code2 = generateShortCode(title, amount);
      expect(code1).toBe(code2);
      expect(code1.startsWith(expectedSlugPrefix.slice(0, 15))).toBe(true);
      expect(code1).toMatch(/^[a-z0-9-]+-[0-9a-f]{4}$/);
      expect(code1.length).toBeLessThanOrEqual(MAX_SHORT_CODE_BYTES);
    });

    it("produces distinct codes when amount changes for same title", () => {
      const code1 = generateShortCode("Movie Night", "20.00");
      const code2 = generateShortCode("Movie Night", "25.00");
      expect(code1).not.toBe(code2);
    });

    it("handles special characters and punctuation by sanitizing", () => {
      const code = generateShortCode("Coffee! @#$%^&*() / 123", "4.50");
      expect(code).toMatch(/^[a-z0-9-]+$/);
      expect(code.length).toBeLessThanOrEqual(MAX_SHORT_CODE_BYTES);
    });

    it("falls back to 'settle' when title consists entirely of special characters", () => {
      const code = generateShortCode("!@#$%^&*()_+", "10.00");
      expect(code).toMatch(/^settle-[0-9a-f]{4}$/);
    });

    it("falls back to 'settle' when title is empty or whitespace", () => {
      const code1 = generateShortCode("", "10.00");
      const code2 = generateShortCode("   ", "10.00");
      expect(code1).toMatch(/^settle-[0-9a-f]{4}$/);
      expect(code2).toMatch(/^settle-[0-9a-f]{4}$/);
    });

    it("truncates long titles to keep total shortcode within 25 bytes", () => {
      const longTitle = "Super Long Vacation Trip to the Alps with Extended Family and Friends 2026";
      const code = generateShortCode(longTitle, "5000.00");
      expect(code.length).toBeLessThanOrEqual(MAX_SHORT_CODE_BYTES);
      const fullMemo = buildSettlementMemo(code);
      expect(fullMemo).not.toBeNull();
      expect(new TextEncoder().encode(fullMemo!).length).toBeLessThanOrEqual(STELLAR_MEMO_MAX_BYTES);
    });
  });

  describe("buildSettlementMemo", () => {
    it("prepends MP: to valid short codes", () => {
      expect(buildSettlementMemo("dinner-8f3a")).toBe("MP:dinner-8f3a");
    });

    it("returns null for empty or whitespace short code", () => {
      expect(buildSettlementMemo("")).toBeNull();
      expect(buildSettlementMemo("   ")).toBeNull();
    });

    it("returns null if short code exceeds MAX_SHORT_CODE_BYTES (25)", () => {
      const tooLongCode = "a".repeat(26);
      expect(buildSettlementMemo(tooLongCode)).toBeNull();
    });

    it("returns null if short code has leading or trailing whitespace", () => {
      expect(buildSettlementMemo(" dinner-8f3a")).toBeNull();
      expect(buildSettlementMemo("dinner-8f3a ")).toBeNull();
    });

    it("returns null if short code contains control characters", () => {
      expect(buildSettlementMemo("dinner\x008f3a")).toBeNull();
      expect(buildSettlementMemo("dinner\x1f8f3a")).toBeNull();
    });

    it("returns null if short code already contains MP: prefix", () => {
      expect(buildSettlementMemo("MP:dinner-8f3a")).toBeNull();
    });
  });

  describe("isValidMergepayMemo", () => {
    it.each([
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
    ])("validates '%s' as %s", (memo, expected) => {
      expect(isValidMergepayMemo(memo)).toBe(expected);
    });
  });

  describe("verifyTransactionMemo", () => {
    it("handles missing or empty memo with 'missing' severity", () => {
      const res1 = verifyTransactionMemo(null, "dinner-8f3a");
      expect(res1.isValid).toBe(false);
      expect(res1.severity).toBe("missing");
      expect(res1.title).toBe("Missing Settlement Memo");
      expect(res1.suggestedMemo).toBe("MP:dinner-8f3a");

      const res2 = verifyTransactionMemo("", "lunch-1234");
      expect(res2.isValid).toBe(false);
      expect(res2.severity).toBe("missing");
      expect(res2.suggestedMemo).toBe("MP:lunch-1234");
    });

    it("flags byte length overflow (>28 bytes)", () => {
      const overLengthMemo = "MP:very-long-reconciliation-code-that-exceeds-limit";
      const res = verifyTransactionMemo(overLengthMemo);
      expect(res.isValid).toBe(false);
      expect(res.severity).toBe("invalid_length");
      expect(res.title).toBe("Memo Exceeds Stellar Limit");
      expect(res.byteLength).toBeGreaterThan(28);
    });

    it("flags missing prefix with 'malformed' severity", () => {
      const res = verifyTransactionMemo("dinner-8f3a", "dinner-8f3a");
      expect(res.isValid).toBe(false);
      expect(res.severity).toBe("malformed");
      expect(res.title).toBe("Unrecognized Memo Format");
      expect(res.message).toContain(SETTLEMENT_MEMO_PREFIX);
    });

    it("flags empty reconciliation code with 'malformed' severity", () => {
      const res = verifyTransactionMemo("MP:");
      expect(res.isValid).toBe(false);
      expect(res.severity).toBe("malformed");
      expect(res.title).toBe("Empty Reconciliation Code");
    });

    it("flags invalid characters in code with 'malformed' severity", () => {
      const res = verifyTransactionMemo("MP:dinner_party!");
      expect(res.isValid).toBe(false);
      expect(res.severity).toBe("malformed");
      expect(res.title).toBe("Invalid Memo Characters");
    });

    it("detects deviation from expected short code with 'deviation' severity", () => {
      const res = verifyTransactionMemo("MP:lunch-9999", "dinner-8f3a");
      expect(res.isValid).toBe(true);
      expect(res.severity).toBe("deviation");
      expect(res.title).toBe("Reconciliation Code Mismatch");
      expect(res.message).toContain("lunch-9999");
      expect(res.suggestedMemo).toBe("MP:dinner-8f3a");
    });

    it("returns 'none' severity for fully valid matching memo", () => {
      const res = verifyTransactionMemo("MP:dinner-8f3a", "dinner-8f3a");
      expect(res.isValid).toBe(true);
      expect(res.severity).toBe("none");
      expect(res.title).toBe("Valid Settlement Memo");
      expect(res.byteLength).toBe(14);
    });
  });

  describe("formatExpenseMemo and parseExpenseMemo", () => {
    it("round-trips expense memo serialization and parsing", () => {
      const memo = formatExpenseMemo({ title: "Dinner", amount: "50.00" });
      expect(memo).not.toBeNull();
      expect(new TextEncoder().encode(memo!).length).toBeLessThanOrEqual(STELLAR_MEMO_MAX_BYTES);

      const parsed = parseExpenseMemo(memo!);
      expect(parsed).not.toBeNull();
    });
  });

  describe("detectMemoDeviations", () => {
    it("returns empty warnings when memo codes match identically", () => {
      const warnings = detectMemoDeviations("MP:dinner-8f3a", "dinner-8f3a");
      expect(warnings).toEqual([]);
    });

    it("detects when prefix is missing in actual memo", () => {
      const warnings = detectMemoDeviations("dinner-8f3a", "dinner-8f3a");
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes('Memo does not start with "MP:"'))).toBe(true);
    });

    it("detects code mismatch", () => {
      const warnings = detectMemoDeviations("MP:lunch-1234", "dinner-8f3a");
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes("Manual memo edits"))).toBe(true);
    });
  });

  describe("Zod schemas for Stellar and Mergepay memos", () => {
    it("stellarTextMemoSchema validates string byte length <= 28", () => {
      expect(stellarTextMemoSchema.safeParse("Valid memo").success).toBe(true);
      expect(stellarTextMemoSchema.safeParse("a".repeat(28)).success).toBe(true);
      expect(stellarTextMemoSchema.safeParse("a".repeat(29)).success).toBe(false);
    });

    it("mergepaySettlementMemoSchema validates MP: prefix and code format", () => {
      expect(mergepaySettlementMemoSchema.safeParse("MP:settle-1234").success).toBe(true);
      expect(mergepaySettlementMemoSchema.safeParse("settle-1234").success).toBe(false);
      expect(mergepaySettlementMemoSchema.safeParse("MP:").success).toBe(false);
    });
  });
});
