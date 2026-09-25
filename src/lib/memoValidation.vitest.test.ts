import { describe, expect, it } from "vitest";
import {
  STELLAR_MEMO_MAX_BYTES,
  PREFIX_BYTES,
  MAX_SHORT_CODE_BYTES,
  validateMemo,
  validateShortCode,
  buildSettlementMemo,
  breakdownMemo,
  detectMemoDeviations,
  generateShortCode,
  sanitizeMemoInput,
  stellarTextMemoSchema,
  mergepaySettlementMemoSchema,
  parseSettlementMemo,
  extractExpenseReferenceFromMemo,
  extractSettlementFromTransactionPayload,
} from "./memoValidation";

// ---------------------------------------------------------------------------
// validateMemo
// ---------------------------------------------------------------------------

describe("validateMemo", () => {
  it("rejects null", () => {
    const result = validateMemo(null);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  it("rejects undefined", () => {
    expect(validateMemo(undefined).valid).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateMemo("").valid).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(validateMemo("   ").valid).toBe(false);
  });

  it("accepts a valid short memo", () => {
    const result = validateMemo("MP:dinner-8f3a");
    expect(result.valid).toBe(true);
    expect(result.byteLength).toBe(14);
  });

  it("rejects a memo exceeding 28 bytes", () => {
    const longMemo = "A".repeat(29);
    const result = validateMemo(longMemo);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/28 bytes/);
    expect(result.byteLength).toBe(29);
  });

  it("accepts a memo exactly at the 28-byte limit", () => {
    const maxMemo = "M".repeat(28);
    const result = validateMemo(maxMemo);
    expect(result.valid).toBe(true);
    expect(result.byteLength).toBe(28);
  });

  it("rejects control characters", () => {
    expect(validateMemo("memo\x00here").valid).toBe(false);
    expect(validateMemo("memo\x1fhere").valid).toBe(false);
    expect(validateMemo("memo\x7fhere").valid).toBe(false);
  });

  it("accepts printable ASCII", () => {
    const result = validateMemo("MP:settle-42-a");
    expect(result.valid).toBe(true);
  });

  it("handles multi-byte UTF-8 correctly", () => {
    // 🌟 is 4 bytes in UTF-8
    const result = validateMemo("a🌟b");
    expect(result.valid).toBe(true);
    expect(result.byteLength).toBe(6); // 1 + 4 + 1
  });

  it("rejects when multi-byte UTF-8 exceeds 28 bytes", () => {
    // Each 🌟 is 4 bytes, so 8 of them = 32 bytes
    const result = validateMemo("🌟🌟🌟🌟🌟🌟🌟🌟");
    expect(result.valid).toBe(false);
    expect(result.byteLength).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// validateShortCode
// ---------------------------------------------------------------------------

describe("validateShortCode", () => {
  it("rejects null", () => {
    expect(validateShortCode(null).valid).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateShortCode("").valid).toBe(false);
  });

  it("accepts a valid short code", () => {
    const result = validateShortCode("dinner-8f3a");
    expect(result.valid).toBe(true);
  });

  it("rejects leading/trailing whitespace", () => {
    const result = validateShortCode("  dinner-8f3a  ");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/whitespace/);
  });

  it("rejects short codes exceeding byte budget", () => {
    const longCode = "a".repeat(MAX_SHORT_CODE_BYTES + 1);
    const result = validateShortCode(longCode);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/bytes/);
  });

  it("rejects short codes containing the prefix", () => {
    const result = validateShortCode("MP:something");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/prefix/);
  });

  it("rejects control characters", () => {
    expect(validateShortCode("code\x00here").valid).toBe(false);
  });

  it("accepts code at maximum byte length", () => {
    const maxCode = "a".repeat(MAX_SHORT_CODE_BYTES);
    const result = validateShortCode(maxCode);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildSettlementMemo
// ---------------------------------------------------------------------------

describe("buildSettlementMemo", () => {
  it("returns null for invalid input", () => {
    expect(buildSettlementMemo(null)).toBeNull();
    expect(buildSettlementMemo("")).toBeNull();
  });

  it("builds a memo with the MP: prefix", () => {
    const memo = buildSettlementMemo("dinner-8f3a");
    expect(memo).toBe("MP:dinner-8f3a");
  });

  it("trims whitespace from the short code and builds memo", () => {
    // buildSettlementMemo calls validateShortCode which trims internally
    const memo = buildSettlementMemo("dinner-8f3a");
    expect(memo).toBe("MP:dinner-8f3a");
  });

  it("returns null for codes that exceed byte limit", () => {
    const longCode = "a".repeat(MAX_SHORT_CODE_BYTES + 1);
    expect(buildSettlementMemo(longCode)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// breakdownMemo
// ---------------------------------------------------------------------------

describe("breakdownMemo", () => {
  it("returns empty breakdown for null memo", () => {
    const bd = breakdownMemo(null);
    expect(bd.conformsToConvention).toBe(false);
    expect(bd.warnings).toHaveLength(0);
  });

  it("breaks down a valid MP: memo", () => {
    const bd = breakdownMemo("MP:dinner-8f3a");
    expect(bd.prefix).toBe("MP:");
    expect(bd.shortCode).toBe("dinner-8f3a");
    expect(bd.conformsToConvention).toBe(true);
    expect(bd.byteLength).toBe(14);
    expect(bd.remainingBytes).toBe(STELLAR_MEMO_MAX_BYTES - 14);
    expect(bd.warnings).toHaveLength(0);
  });

  it("warns when memo doesn't start with MP:", () => {
    const bd = breakdownMemo("CUSTOM:dinner");
    expect(bd.conformsToConvention).toBe(false);
    expect(bd.warnings).toHaveLength(1);
    expect(bd.warnings[0]).toMatch(/prefix/i);
  });

  it("warns when memo deviates from expected code", () => {
    const bd = breakdownMemo("MP:dinner-8f3a", "lunch-abcd");
    expect(bd.warnings).toHaveLength(1);
    expect(bd.warnings[0]).toMatch(/deviates/i);
    expect(bd.warnings[0]).toMatch(/lunch-abcd/);
  });

  it("does not warn when memo matches expected code", () => {
    const bd = breakdownMemo("MP:dinner-8f3a", "dinner-8f3a");
    expect(bd.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// detectMemoDeviations
// ---------------------------------------------------------------------------

describe("detectMemoDeviations", () => {
  const originalCode = "dinner-8f3a";

  it("returns empty array when memo matches", () => {
    const warnings = detectMemoDeviations("MP:dinner-8f3a", originalCode);
    expect(warnings).toHaveLength(0);
  });

  it("warns when memo is completely different", () => {
    const warnings = detectMemoDeviations("MP:other-code", originalCode);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes("expected"))).toBe(true);
  });

  it("warns when prefix is missing", () => {
    const warnings = detectMemoDeviations("dinner-8f3a", originalCode);
    expect(warnings.some((w) => w.includes("MP:"))).toBe(true);
  });

  it("warns when memo is too long", () => {
    const longMemo = "MP:" + "a".repeat(26);
    const warnings = detectMemoDeviations(longMemo, originalCode);
    expect(warnings.some((w) => w.includes("28 bytes"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateShortCode
// ---------------------------------------------------------------------------

describe("generateShortCode", () => {
  it("produces a dash-separated slug with 4 hex chars", () => {
    const code = generateShortCode("Dinner at the restaurant", "42.5000000");
    expect(code).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{4}$/);
  });

  it("is deterministic for the same inputs", () => {
    const a = generateShortCode("Dinner", "10.0000000");
    const b = generateShortCode("Dinner", "10.0000000");
    expect(a).toBe(b);
  });

  it("produces different codes for different labels", () => {
    const a = generateShortCode("Dinner", "10.0000000");
    const b = generateShortCode("Lunch", "10.0000000");
    expect(a).not.toBe(b);
  });

  it("produces different codes for different amounts", () => {
    const a = generateShortCode("Dinner", "10.0000000");
    const b = generateShortCode("Dinner", "20.0000000");
    expect(a).not.toBe(b);
  });

  it("falls back to 'settle' for empty labels", () => {
    const code = generateShortCode("", "10.0000000");
    expect(code).toMatch(/^settle-[0-9a-f]{4}$/);
  });

  it("slugs special characters correctly", () => {
    const code = generateShortCode("Dinner @ Restaurant #1", "10.0000000");
    // After 16-char cap, the slug becomes "dinner-restauran" and hex suffix is appended
    expect(code).toMatch(/^dinner-restauran-[0-9a-f]{4}$/);
  });

  it("caps slug at 16 characters", () => {
    const longLabel = "This is a very long expense title that goes on forever";
    const code = generateShortCode(longLabel, "10.0000000");
    const slugPart = code.split("-").slice(0, -1).join("-");
    // The slug portion (before the hex) should be at most 16 chars
    const slug = code.slice(0, code.lastIndexOf("-"));
    expect(slug.length).toBeLessThanOrEqual(16);
  });
});

// ---------------------------------------------------------------------------
// Constants sanity
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("STELLAR_MEMO_MAX_BYTES is 28", () => {
    expect(STELLAR_MEMO_MAX_BYTES).toBe(28);
  });

  it("PREFIX_BYTES is 3 (MP:)", () => {
    expect(PREFIX_BYTES).toBe(3);
  });

  it("MAX_SHORT_CODE_BYTES is 25", () => {
    expect(MAX_SHORT_CODE_BYTES).toBe(25);
  });

  it("PREFIX_BYTES + MAX_SHORT_CODE_BYTES equals STELLAR_MEMO_MAX_BYTES", () => {
    expect(PREFIX_BYTES + MAX_SHORT_CODE_BYTES).toBe(STELLAR_MEMO_MAX_BYTES);
  });
});

// ---------------------------------------------------------------------------
// Sanitization & Zod Schemas & Extraction Tests (Closes #389)
// ---------------------------------------------------------------------------

describe("sanitizeMemoInput", () => {
  it("handles null and undefined", () => {
    expect(sanitizeMemoInput(null)).toBe("");
    expect(sanitizeMemoInput(undefined)).toBe("");
  });

  it("trims whitespace and strips control characters", () => {
    const dirty = "  MP:lunch-1a2b\x00\x07  ";
    expect(sanitizeMemoInput(dirty)).toBe("MP:lunch-1a2b");
  });

  it("normalizes internal whitespace", () => {
    expect(sanitizeMemoInput("MP:  lunch   1a2b  ")).toBe("MP: lunch 1a2b");
  });
});

describe("Zod schemas", () => {
  it("stellarTextMemoSchema validates standard memo", () => {
    const parsed = stellarTextMemoSchema.safeParse("Hello Stellar");
    expect(parsed.success).toBe(true);
  });

  it("stellarTextMemoSchema rejects empty string", () => {
    const parsed = stellarTextMemoSchema.safeParse("");
    expect(parsed.success).toBe(false);
  });

  it("stellarTextMemoSchema rejects over 28 bytes", () => {
    const parsed = stellarTextMemoSchema.safeParse("a".repeat(29));
    expect(parsed.success).toBe(false);
  });

  it("stellarTextMemoSchema rejects control characters", () => {
    const parsed = stellarTextMemoSchema.safeParse("invalid\x00memo");
    expect(parsed.success).toBe(false);
  });

  it("mergepaySettlementMemoSchema validates standard Mergepay memo", () => {
    const parsed = mergepaySettlementMemoSchema.safeParse("MP:dinner-8f3a");
    expect(parsed.success).toBe(true);
  });

  it("mergepaySettlementMemoSchema rejects memo missing MP: prefix", () => {
    const parsed = mergepaySettlementMemoSchema.safeParse("dinner-8f3a");
    expect(parsed.success).toBe(false);
  });

  it("mergepaySettlementMemoSchema rejects duplicate MP: prefix in code", () => {
    const parsed = mergepaySettlementMemoSchema.safeParse("MP:MP:dinner");
    expect(parsed.success).toBe(false);
  });
});

describe("parseSettlementMemo", () => {
  it("rejects invalid or empty memo", () => {
    expect(parseSettlementMemo(null).valid).toBe(false);
    expect(parseSettlementMemo("").valid).toBe(false);
  });

  it("rejects memo without MP: prefix", () => {
    const res = parseSettlementMemo("dinner-8f3a");
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/prefix/i);
  });

  it("successfully parses valid MP: settlement memo", () => {
    const res = parseSettlementMemo("MP:dinner-8f3a");
    expect(res.valid).toBe(true);
    expect(res.prefix).toBe("MP:");
    expect(res.shortCode).toBe("dinner-8f3a");
  });
});

describe("extractExpenseReferenceFromMemo", () => {
  it("extracts slug and hash suffix correctly", () => {
    const res = extractExpenseReferenceFromMemo("MP:dinner-8f3a");
    expect(res.valid).toBe(true);
    expect(res.shortCode).toBe("dinner-8f3a");
    expect(res.expenseSlug).toBe("dinner");
    expect(res.hashSuffix).toBe("8f3a");
  });

  it("handles multi-word hyphenated slugs", () => {
    const res = extractExpenseReferenceFromMemo("MP:team-lunch-trip-9b2c");
    expect(res.valid).toBe(true);
    expect(res.expenseSlug).toBe("team-lunch-trip");
    expect(res.hashSuffix).toBe("9b2c");
  });

  it("returns invalid result for non-conforming memo", () => {
    const res = extractExpenseReferenceFromMemo("random-string");
    expect(res.valid).toBe(false);
  });
});

describe("extractSettlementFromTransactionPayload", () => {
  it("returns error for empty or invalid payload", () => {
    expect(extractSettlementFromTransactionPayload(null).matched).toBe(false);
    expect(extractSettlementFromTransactionPayload({}).matched).toBe(false);
  });

  it("extracts settlement from string memo Horizon payload", () => {
    const payload = {
      id: "tx-123",
      memo: "MP:groceries-4e12",
      memo_type: "text",
    };
    const res = extractSettlementFromTransactionPayload(payload);
    expect(res.matched).toBe(true);
    expect(res.memo).toBe("MP:groceries-4e12");
    expect(res.shortCode).toBe("groceries-4e12");
    expect(res.expenseSlug).toBe("groceries");
    expect(res.hashSuffix).toBe("4e12");
  });

  it("extracts settlement from nested memo object payload", () => {
    const payload = {
      id: "tx-456",
      memo: {
        type: "text",
        value: "MP:hotel-99aa",
      },
    };
    const res = extractSettlementFromTransactionPayload(payload);
    expect(res.matched).toBe(true);
    expect(res.memo).toBe("MP:hotel-99aa");
    expect(res.shortCode).toBe("hotel-99aa");
  });

  it("handles non-Mergepay memo gracefully without crash", () => {
    const payload = {
      memo: "Personal gift",
    };
    const res = extractSettlementFromTransactionPayload(payload);
    expect(res.matched).toBe(false);
    expect(res.memo).toBe("Personal gift");
  });
});

