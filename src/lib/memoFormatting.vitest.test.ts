/**
 * Comprehensive unit-test suite for transaction memo formatting logic.
 *
 * Covers:
 *   - `MP:<code>` generation via `buildSettlementMemo` + `generateShortCode`
 *   - Parsing and code extraction (`parseSettlementMemo`,
 *     `extractExpenseReferenceFromMemo`,
 *     `extractSettlementFromTransactionPayload`)
 *   - High-level UI helpers (`verifyTransactionMemo`, `isValidMergepayMemo`)
 *   - Input sanitization (`sanitizeMemoInput`)
 *   - Zod schema boundaries (`stellarTextMemoSchema`,
 *     `mergepaySettlementMemoSchema`)
 *   - Structural consistency across validators, builder, and Zod schemas
 *   - Edge cases: boundary IDs, special characters, multi-byte UTF-8,
 *     control characters, and various ID lengths
 *
 * Runner: vitest (`*.vitest.test.ts` include pattern in vitest.config.ts).
 * Execute: npm test  (vitest run phase)
 */

import { describe, expect, it } from "vitest";
import {
  STELLAR_MEMO_MAX_BYTES,
  MAX_SHORT_CODE_BYTES,
  PREFIX_BYTES,
  buildSettlementMemo,
  breakdownMemo,
  detectMemoDeviations,
  extractExpenseReferenceFromMemo,
  extractSettlementFromTransactionPayload,
  generateShortCode,
  mergepaySettlementMemoSchema,
  parseSettlementMemo,
  sanitizeMemoInput,
  stellarTextMemoSchema,
  validateMemo,
  validateShortCode,
} from "./memoValidation";
import {
  isValidMergepayMemo,
  MERGEPAY_MEMO_REGEX,
  verifyTransactionMemo,
} from "./memo";

// ---------------------------------------------------------------------------
// 1. Memo string generation — buildSettlementMemo
// ---------------------------------------------------------------------------

describe("buildSettlementMemo — memo string generation", () => {
  it("generates the canonical MP: prefix + short code structure", () => {
    expect(buildSettlementMemo("dinner-8f3a")).toBe("MP:dinner-8f3a");
  });

  it("generates a memo for a minimal 1-character short code", () => {
    expect(buildSettlementMemo("a")).toBe("MP:a");
  });

  it("generates a memo for a single hyphen-separated segment short code", () => {
    expect(buildSettlementMemo("abc")).toBe("MP:abc");
  });

  it("generates a memo at exactly the 28-byte Stellar limit (25-byte code)", () => {
    const maxCode = "a".repeat(MAX_SHORT_CODE_BYTES); // 25 chars = 25 bytes ASCII
    const memo = buildSettlementMemo(maxCode);
    expect(memo).toBe(`MP:${maxCode}`);
    expect(new TextEncoder().encode(memo!).length).toBe(STELLAR_MEMO_MAX_BYTES);
  });

  it("generates consistent output for repeated calls with the same input", () => {
    expect(buildSettlementMemo("trip-ab12")).toBe(buildSettlementMemo("trip-ab12"));
  });

  it("returns null for a null short code", () => {
    expect(buildSettlementMemo(null)).toBeNull();
  });

  it("returns null for an undefined short code", () => {
    expect(buildSettlementMemo(undefined)).toBeNull();
  });

  it("returns null for an empty string short code", () => {
    expect(buildSettlementMemo("")).toBeNull();
  });

  it("returns null for a whitespace-only short code", () => {
    expect(buildSettlementMemo("   ")).toBeNull();
  });

  it("returns null for a short code that exceeds the 25-byte budget", () => {
    expect(buildSettlementMemo("a".repeat(MAX_SHORT_CODE_BYTES + 1))).toBeNull();
  });

  it("returns null when the short code itself contains the MP: prefix", () => {
    expect(buildSettlementMemo("MP:already-prefixed")).toBeNull();
  });

  it("returns null for a short code that contains a control character", () => {
    expect(buildSettlementMemo("code\x00here")).toBeNull();
    expect(buildSettlementMemo("code\x1fhere")).toBeNull();
    expect(buildSettlementMemo("code\x7fhere")).toBeNull();
  });

  it("returns null for a short code with leading whitespace", () => {
    // validateShortCode explicitly rejects leading/trailing whitespace
    expect(buildSettlementMemo("  dinner-8f3a")).toBeNull();
  });

  it("produces a memo whose byte length never exceeds 28 regardless of code length", () => {
    // Several valid short codes of varying lengths
    for (const code of ["x", "ab-12", "settle-0000", "a".repeat(25)]) {
      const memo = buildSettlementMemo(code);
      expect(memo).not.toBeNull();
      expect(new TextEncoder().encode(memo!).length).toBeLessThanOrEqual(
        STELLAR_MEMO_MAX_BYTES
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Short code generation — generateShortCode
// ---------------------------------------------------------------------------

describe("generateShortCode — deterministic slug generation", () => {
  it("produces a slug + 4-hex-char suffix separated by a hyphen", () => {
    expect(generateShortCode("Dinner", "42.00")).toMatch(
      /^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{4}$/
    );
  });

  it("is deterministic for identical label + amount inputs", () => {
    const a = generateShortCode("Groceries", "25.50");
    const b = generateShortCode("Groceries", "25.50");
    expect(a).toBe(b);
  });

  it("produces different codes for different labels (same amount)", () => {
    expect(generateShortCode("Dinner", "10.00")).not.toBe(
      generateShortCode("Lunch", "10.00")
    );
  });

  it("produces different codes for different amounts (same label)", () => {
    expect(generateShortCode("Dinner", "10.00")).not.toBe(
      generateShortCode("Dinner", "20.00")
    );
  });

  it("falls back to 'settle' when the label has only special characters", () => {
    expect(generateShortCode("@#$%^&*!", "5.00")).toMatch(
      /^settle-[0-9a-f]{4}$/
    );
  });

  it("falls back to 'settle' for an empty label", () => {
    expect(generateShortCode("", "5.00")).toMatch(/^settle-[0-9a-f]{4}$/);
  });

  it("falls back to 'settle' for a whitespace-only label", () => {
    expect(generateShortCode("   ", "5.00")).toMatch(/^settle-[0-9a-f]{4}$/);
  });

  it("strips emojis and non-ASCII characters from the slug", () => {
    // Emojis and accented letters collapse away; remaining ASCII words survive
    expect(generateShortCode("🍕 Pizza & Beer 🍻", "18.00")).toMatch(
      /^pizza-beer-[0-9a-f]{4}$/
    );
  });

  it("collapses consecutive whitespace/special chars into a single hyphen", () => {
    const code = generateShortCode("  Trip   to   NYC  ", "100.00");
    expect(code).not.toContain("--");
    expect(code).toMatch(/^trip-to-nyc-[0-9a-f]{4}$/);
  });

  it("strips leading and trailing hyphens from the slug", () => {
    const code = generateShortCode("---BBQ---", "30.00");
    // No leading hyphen in the output
    expect(code).not.toMatch(/^-/);
    // Full output matches the expected slug-hexsuffix shape
    expect(code).toMatch(/^bbq-[0-9a-f]{4}$/);
  });

  it("caps slug at 16 characters so the full code stays within the short-code budget", () => {
    const longLabel =
      "This is a very very long expense title that far exceeds sixteen chars";
    const code = generateShortCode(longLabel, "99.99");
    const slug = code.slice(0, code.lastIndexOf("-"));
    // Slug must not exceed 16 characters
    expect(slug.length).toBeLessThanOrEqual(16);
    // Full short code must not exceed the 25-byte budget
    expect(code.length).toBeLessThanOrEqual(MAX_SHORT_CODE_BYTES);
  });

  it("produces lowercase output only", () => {
    const code = generateShortCode("HOTEL BOOKING", "500.00");
    expect(code).toBe(code.toLowerCase());
  });

  it("output only contains alphanumeric chars and hyphens (ASCII-safe for Stellar)", () => {
    const labels = [
      "Crème Brûlée",
      "Tôkyô trip",
      "€uro dinner",
      "Müller's share",
      "日本語",
    ];
    for (const label of labels) {
      const code = generateShortCode(label, "10.00");
      expect(code).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("the resulting memo from a generated code always fits within 28 bytes", () => {
    const samples = [
      ["Dinner at Terra Kulture", "150.00"],
      ["Hotel", "1234.56"],
      ["A very very long title that should still work within limits", "0.01"],
      ["🎉 Party Night 🎉", "99.99"],
    ];
    for (const [label, amount] of samples) {
      const code = generateShortCode(label, amount);
      const memo = buildSettlementMemo(code);
      expect(memo).not.toBeNull();
      expect(new TextEncoder().encode(memo!).length).toBeLessThanOrEqual(
        STELLAR_MEMO_MAX_BYTES
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Parsing — parseSettlementMemo
// ---------------------------------------------------------------------------

describe("parseSettlementMemo — code extraction from memo strings", () => {
  it("correctly parses a well-formed MP: memo into prefix + short code", () => {
    const result = parseSettlementMemo("MP:dinner-8f3a");
    expect(result.valid).toBe(true);
    expect(result.prefix).toBe("MP:");
    expect(result.shortCode).toBe("dinner-8f3a");
    expect(result.error).toBeUndefined();
  });

  it("parses short codes of various lengths (1 to 25 chars)", () => {
    const lengths = [1, 5, 10, 15, 20, 25];
    for (const len of lengths) {
      const code = "a".repeat(len);
      const result = parseSettlementMemo(`MP:${code}`);
      expect(result.valid).toBe(true);
      expect(result.shortCode).toBe(code);
    }
  });

  it("parses a hyphenated multi-word short code", () => {
    const result = parseSettlementMemo("MP:team-lunch-trip-9b2c");
    expect(result.valid).toBe(true);
    expect(result.shortCode).toBe("team-lunch-trip-9b2c");
  });

  it("parses a numeric-only short code", () => {
    const result = parseSettlementMemo("MP:12345678");
    expect(result.valid).toBe(true);
    expect(result.shortCode).toBe("12345678");
  });

  it("parses a mixed alphanumeric short code", () => {
    const result = parseSettlementMemo("MP:settle-a1b2");
    expect(result.valid).toBe(true);
    expect(result.shortCode).toBe("settle-a1b2");
  });

  it("is case-preserving — does not force lowercase on the extracted code", () => {
    const result = parseSettlementMemo("MP:DINNER-8F3A");
    expect(result.valid).toBe(true);
    expect(result.shortCode).toBe("DINNER-8F3A");
  });

  it("trims leading/trailing whitespace from the full memo before parsing", () => {
    const result = parseSettlementMemo("   MP:dinner-8f3a   ");
    expect(result.valid).toBe(true);
    expect(result.shortCode).toBe("dinner-8f3a");
  });

  it("round-trips a buildSettlementMemo output back to the original code", () => {
    const code = generateShortCode("Concert tickets", "85.00");
    const memo = buildSettlementMemo(code)!;
    const parsed = parseSettlementMemo(memo);
    expect(parsed.valid).toBe(true);
    expect(parsed.shortCode).toBe(code);
  });

  it("rejects null input", () => {
    const result = parseSettlementMemo(null);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects undefined input", () => {
    expect(parseSettlementMemo(undefined).valid).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(parseSettlementMemo("").valid).toBe(false);
  });

  it("rejects a whitespace-only string", () => {
    expect(parseSettlementMemo("   ").valid).toBe(false);
  });

  it("rejects a memo missing the MP: prefix", () => {
    for (const bad of [
      "dinner-8f3a",
      "XP:dinner-8f3a",
      "mp:dinner-8f3a", // lowercase prefix — not valid
      "Dinner at restaurant",
    ]) {
      const result = parseSettlementMemo(bad);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/prefix/i);
    }
  });

  it("rejects MP: followed by nothing", () => {
    const result = parseSettlementMemo("MP:");
    expect(result.valid).toBe(false);
  });

  it("rejects MP: followed only by whitespace", () => {
    // After trimming the full memo, the extracted code is still whitespace
    // which fails validateShortCode
    const result = parseSettlementMemo("MP:   ");
    expect(result.valid).toBe(false);
  });

  it("rejects a memo that contains a nested MP: prefix in the code", () => {
    const result = parseSettlementMemo("MP:MP:dinner");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/prefix/i);
  });

  it("rejects a memo exceeding the 28-byte Stellar limit", () => {
    const overlong = "MP:" + "a".repeat(26); // 3 + 26 = 29 bytes
    const result = parseSettlementMemo(overlong);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/28 bytes|exceeds/i);
  });

  it("rejects memos containing ASCII control characters", () => {
    for (const ctrl of ["\x00", "\x07", "\x1f", "\x7f"]) {
      const result = parseSettlementMemo(`MP:da${ctrl}ta`);
      expect(result.valid).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Extraction — extractExpenseReferenceFromMemo
// ---------------------------------------------------------------------------

describe("extractExpenseReferenceFromMemo — transaction code extraction", () => {
  it("splits a standard slug-hash memo into expenseSlug and hashSuffix", () => {
    const ref = extractExpenseReferenceFromMemo("MP:dinner-8f3a");
    expect(ref.valid).toBe(true);
    expect(ref.shortCode).toBe("dinner-8f3a");
    expect(ref.expenseSlug).toBe("dinner");
    expect(ref.hashSuffix).toBe("8f3a");
  });

  it("handles a multi-segment hyphenated slug (team-lunch-trip-9b2c)", () => {
    const ref = extractExpenseReferenceFromMemo("MP:team-lunch-trip-9b2c");
    expect(ref.valid).toBe(true);
    expect(ref.expenseSlug).toBe("team-lunch-trip");
    expect(ref.hashSuffix).toBe("9b2c");
  });

  it("treats a code without any hyphen as a bare slug with no hash suffix", () => {
    const ref = extractExpenseReferenceFromMemo("MP:dinner");
    expect(ref.valid).toBe(true);
    expect(ref.expenseSlug).toBe("dinner");
    expect(ref.hashSuffix).toBeUndefined();
  });

  it("correctly extracts from a generateShortCode-produced memo", () => {
    const code = generateShortCode("Taxi to airport", "42.50");
    const memo = buildSettlementMemo(code)!;
    const ref = extractExpenseReferenceFromMemo(memo);
    expect(ref.valid).toBe(true);
    expect(ref.shortCode).toBe(code);
    expect(ref.hashSuffix).toBe(code.split("-").at(-1));
    expect(ref.expenseSlug).toBe(code.split("-").slice(0, -1).join("-"));
  });

  it("extracts from a maximum-length 25-char short code", () => {
    // 24 'a' chars + '-' + 'b' = 'aaaaaaaa...a-b' (25 chars total)
    const code = "a".repeat(23) + "-b";
    const ref = extractExpenseReferenceFromMemo(`MP:${code}`);
    expect(ref.valid).toBe(true);
    expect(ref.shortCode).toBe(code);
    expect(ref.hashSuffix).toBe("b");
  });

  it("rejects a memo missing the MP: prefix", () => {
    expect(extractExpenseReferenceFromMemo("no-prefix-here").valid).toBe(false);
  });

  it("rejects an overlong memo (29+ bytes)", () => {
    expect(
      extractExpenseReferenceFromMemo("MP:" + "a".repeat(26)).valid
    ).toBe(false);
  });

  it("rejects null input", () => {
    expect(extractExpenseReferenceFromMemo(null).valid).toBe(false);
  });

  it("rejects undefined input", () => {
    expect(extractExpenseReferenceFromMemo(undefined).valid).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(extractExpenseReferenceFromMemo("").valid).toBe(false);
  });

  it("produces slug/suffix that reassemble into the original short code", () => {
    const labels = [
      ["Groceries", "25.00"],
      ["Hotel booking", "310.00"],
      ["Concert tickets", "85.00"],
    ];
    for (const [label, amount] of labels) {
      const code = generateShortCode(label, amount);
      const ref = extractExpenseReferenceFromMemo(buildSettlementMemo(code)!);
      expect(ref.valid).toBe(true);
      // slug + "-" + suffix should equal the original short code
      const reassembled = ref.hashSuffix
        ? `${ref.expenseSlug}-${ref.hashSuffix}`
        : ref.expenseSlug;
      expect(reassembled).toBe(ref.shortCode);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Transaction payload extraction — extractSettlementFromTransactionPayload
// ---------------------------------------------------------------------------

describe("extractSettlementFromTransactionPayload — Horizon payload parsing", () => {
  it("extracts settlement from a flat string `memo` field", () => {
    const res = extractSettlementFromTransactionPayload({
      id: "tx-001",
      memo: "MP:groceries-4e12",
      memo_type: "text",
    });
    expect(res.matched).toBe(true);
    expect(res.memo).toBe("MP:groceries-4e12");
    expect(res.shortCode).toBe("groceries-4e12");
    expect(res.expenseSlug).toBe("groceries");
    expect(res.hashSuffix).toBe("4e12");
  });

  it("extracts settlement from `memo_text` field (Horizon history variant)", () => {
    const res = extractSettlementFromTransactionPayload({
      memo_text: "MP:hotel-99aa",
    });
    expect(res.matched).toBe(true);
    expect(res.shortCode).toBe("hotel-99aa");
  });

  it("extracts settlement from a nested memo object with `value` key", () => {
    const res = extractSettlementFromTransactionPayload({
      memo: { type: "text", value: "MP:team-lunch-7f2e" },
    });
    expect(res.matched).toBe(true);
    expect(res.shortCode).toBe("team-lunch-7f2e");
    expect(res.expenseSlug).toBe("team-lunch");
    expect(res.hashSuffix).toBe("7f2e");
  });

  it("extracts settlement from a nested memo object with `_value` key", () => {
    const res = extractSettlementFromTransactionPayload({
      memo: { type: "text", _value: "MP:vault-77aa" },
    });
    expect(res.matched).toBe(true);
    expect(res.shortCode).toBe("vault-77aa");
    expect(res.expenseSlug).toBe("vault");
    expect(res.hashSuffix).toBe("77aa");
  });

  it("returns matched=false for a null payload", () => {
    expect(extractSettlementFromTransactionPayload(null).matched).toBe(false);
  });

  it("returns matched=false for a string payload (not an object)", () => {
    expect(
      extractSettlementFromTransactionPayload("not-an-object").matched
    ).toBe(false);
  });

  it("returns matched=false for an empty object (no memo field)", () => {
    expect(extractSettlementFromTransactionPayload({}).matched).toBe(false);
  });

  it("returns matched=false when memo field exists but is not a string or object", () => {
    expect(
      extractSettlementFromTransactionPayload({ memo: 42 }).matched
    ).toBe(false);
    expect(
      extractSettlementFromTransactionPayload({ memo: true }).matched
    ).toBe(false);
    expect(
      extractSettlementFromTransactionPayload({ memo: [] }).matched
    ).toBe(false);
  });

  it("returns matched=false for a non-Mergepay memo but preserves the memo text", () => {
    const res = extractSettlementFromTransactionPayload({
      memo: "Personal gift",
    });
    expect(res.matched).toBe(false);
    expect(res.memo).toBe("Personal gift");
    expect(res.error).toBeTruthy();
  });

  it("sanitizes dirty memo before extraction (strips control chars and trims)", () => {
    const res = extractSettlementFromTransactionPayload({
      memo: "  MP:dinner-\x00\t8f3a  ",
    });
    expect(res.matched).toBe(true);
    expect(res.memo).toBe("MP:dinner-8f3a");
    expect(res.shortCode).toBe("dinner-8f3a");
  });

  it("correctly traverses the full generate → build → extract pipeline", () => {
    const code = generateShortCode("Hotel booking", "310.00");
    const memo = buildSettlementMemo(code)!;
    const res = extractSettlementFromTransactionPayload({
      id: "tx-pipeline",
      memo,
      memo_type: "text",
    });
    expect(res.matched).toBe(true);
    expect(res.shortCode).toBe(code);
    expect(res.memo).toBe(memo);
  });
});

// ---------------------------------------------------------------------------
// 6. UI helper — verifyTransactionMemo
// ---------------------------------------------------------------------------

describe("verifyTransactionMemo — user-facing memo verification", () => {
  it("returns severity=none and isValid=true for a correct memo matching expected code", () => {
    const res = verifyTransactionMemo("MP:dinner-8f3a", "dinner-8f3a");
    expect(res.isValid).toBe(true);
    expect(res.severity).toBe("none");
    expect(res.title).toBe("Valid Settlement Memo");
    expect(res.byteLength).toBe(14);
  });

  it("returns isValid=true and severity=none when no expectedShortCode is given", () => {
    const res = verifyTransactionMemo("MP:settle-1234");
    expect(res.isValid).toBe(true);
    expect(res.severity).toBe("none");
  });

  // -- Missing memo --

  it("returns severity=missing for a null memo", () => {
    const res = verifyTransactionMemo(null, "dinner-8f3a");
    expect(res.isValid).toBe(false);
    expect(res.severity).toBe("missing");
    expect(res.suggestedMemo).toBe("MP:dinner-8f3a");
  });

  it("returns severity=missing for an empty string memo", () => {
    expect(verifyTransactionMemo("", "dinner-8f3a").severity).toBe("missing");
  });

  it("returns severity=missing for a whitespace-only memo", () => {
    expect(verifyTransactionMemo("   ", "dinner-8f3a").severity).toBe("missing");
  });

  it("includes suggestedMemo in missing-memo result when expectedShortCode is valid", () => {
    const res = verifyTransactionMemo(null, "trip-ab12");
    expect(res.suggestedMemo).toBe("MP:trip-ab12");
  });

  it("omits suggestedMemo in missing-memo result when no expectedShortCode is given", () => {
    const res = verifyTransactionMemo(null);
    expect(res.suggestedMemo).toBeUndefined();
  });

  // -- Byte length overflow --

  it("returns severity=invalid_length for a memo exceeding 28 bytes", () => {
    const longMemo = "MP:" + "x".repeat(30);
    const res = verifyTransactionMemo(longMemo);
    expect(res.isValid).toBe(false);
    expect(res.severity).toBe("invalid_length");
    expect(res.byteLength).toBeGreaterThan(STELLAR_MEMO_MAX_BYTES);
  });

  it("returns severity=invalid_length message referencing the byte limit", () => {
    const longMemo = "A".repeat(29);
    const res = verifyTransactionMemo(longMemo);
    expect(res.message).toMatch(/28/);
  });

  // -- Malformed memo --

  it("returns severity=malformed when the MP: prefix is missing", () => {
    const res = verifyTransactionMemo("invoice-123", "dinner-8f3a");
    expect(res.isValid).toBe(false);
    expect(res.severity).toBe("malformed");
    expect(res.suggestedMemo).toBe("MP:dinner-8f3a");
  });

  it("returns severity=malformed for an empty code after the MP: prefix", () => {
    const res = verifyTransactionMemo("MP:");
    expect(res.isValid).toBe(false);
    expect(res.severity).toBe("malformed");
  });

  it("returns severity=malformed for a code with invalid special characters", () => {
    const res = verifyTransactionMemo("MP:dinner@#$");
    expect(res.isValid).toBe(false);
    expect(res.severity).toBe("malformed");
    expect(res.title).toMatch(/Invalid Memo Characters/i);
  });

  it("returns severity=malformed for a code containing spaces", () => {
    expect(verifyTransactionMemo("MP:dinner 8f3a").severity).toBe("malformed");
  });

  it("returns severity=malformed for a code containing multi-byte UTF-8 characters", () => {
    expect(verifyTransactionMemo("MP:café-10").severity).toBe("malformed");
  });

  it("includes actionHint in every malformed result", () => {
    const res = verifyTransactionMemo("bad-memo");
    expect(res.actionHint).toBeTruthy();
  });

  // -- Deviation --

  it("returns severity=deviation when the code differs from the expected code", () => {
    const res = verifyTransactionMemo("MP:lunch-456", "dinner-8f3a");
    expect(res.isValid).toBe(true); // structurally valid
    expect(res.severity).toBe("deviation");
    expect(res.message).toMatch(/differs from the expected/i);
    expect(res.suggestedMemo).toBe("MP:dinner-8f3a");
  });

  it("is case-insensitive for the deviation check", () => {
    // Uppercase code should match the lowercase expectedShortCode
    const res = verifyTransactionMemo("MP:DINNER-8F3A", "dinner-8f3a");
    expect(res.severity).toBe("none");
    expect(res.isValid).toBe(true);
  });

  // -- Byte length precision --

  it("measures byteLength on the trimmed memo, not the raw input", () => {
    const res = verifyTransactionMemo("  MP:dinner-8f3a  ", "dinner-8f3a");
    expect(res.byteLength).toBe(14); // "MP:dinner-8f3a" is 14 ASCII bytes
    expect(res.severity).toBe("none");
  });

  it("measures byteLength for multi-byte UTF-8 accurately", () => {
    // "MP:" (3) + "🌟" (4) = 7 bytes; fits within 28
    const res = verifyTransactionMemo("MP:🌟");
    // The code fails the alphanumeric regex, so severity=malformed, but
    // the byteLength must still reflect the actual UTF-8 length
    expect(res.byteLength).toBe(7);
    expect(res.severity).toBe("malformed");
  });
});

// ---------------------------------------------------------------------------
// 7. isValidMergepayMemo
// ---------------------------------------------------------------------------

describe("isValidMergepayMemo — regex-level validation", () => {
  it("returns true for a well-formed MP: memo", () => {
    expect(isValidMergepayMemo("MP:dinner-8f3a")).toBe(true);
  });

  it("returns true for an uppercase short code (case-insensitive regex)", () => {
    expect(isValidMergepayMemo("MP:DINNER-8F3A")).toBe(true);
  });

  it("returns true for a memo after trimming surrounding whitespace", () => {
    expect(isValidMergepayMemo("  MP:settle-1234  ")).toBe(true);
  });

  it("returns true for a numeric-only short code", () => {
    expect(isValidMergepayMemo("MP:12345678")).toBe(true);
  });

  it("returns true for a memo at the exact 28-byte limit", () => {
    const maxCode = "a".repeat(MAX_SHORT_CODE_BYTES); // 25 'a'
    expect(isValidMergepayMemo(`MP:${maxCode}`)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isValidMergepayMemo(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isValidMergepayMemo(undefined)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isValidMergepayMemo("")).toBe(false);
  });

  it("returns false for a memo without the MP: prefix", () => {
    expect(isValidMergepayMemo("dinner-8f3a")).toBe(false);
    expect(isValidMergepayMemo("xp:dinner-8f3a")).toBe(false);
  });

  it("returns false for a memo with spaces in the short code", () => {
    expect(isValidMergepayMemo("MP:dinner 8f3a")).toBe(false);
  });

  it("returns false for a memo with special characters in the short code", () => {
    expect(isValidMergepayMemo("MP:dinner@8f3a")).toBe(false);
    expect(isValidMergepayMemo("MP:dinner.8f3a")).toBe(false);
    expect(isValidMergepayMemo("MP:dinner_8f3a")).toBe(false);
  });

  it("returns false for a short code exceeding the 25-byte budget", () => {
    expect(isValidMergepayMemo(`MP:${"a".repeat(MAX_SHORT_CODE_BYTES + 1)}`)).toBe(
      false
    );
  });

  it("returns false for a memo containing multi-byte UTF-8 chars in the code", () => {
    expect(isValidMergepayMemo("MP:café-1")).toBe(false);
    expect(isValidMergepayMemo("MP:naïve")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. MERGEPAY_MEMO_REGEX
// ---------------------------------------------------------------------------

describe("MERGEPAY_MEMO_REGEX — structural format pattern", () => {
  it("matches a standard MP: memo", () => {
    expect(MERGEPAY_MEMO_REGEX.test("MP:dinner-8f3a")).toBe(true);
  });

  it("matches an uppercase code (flag i)", () => {
    expect(MERGEPAY_MEMO_REGEX.test("MP:SETTLE-ABCD")).toBe(true);
  });

  it("matches a purely numeric short code", () => {
    expect(MERGEPAY_MEMO_REGEX.test("MP:123456")).toBe(true);
  });

  it("does not match a memo missing the MP: prefix", () => {
    expect(MERGEPAY_MEMO_REGEX.test("dinner-8f3a")).toBe(false);
  });

  it("does not match a memo with spaces", () => {
    expect(MERGEPAY_MEMO_REGEX.test("MP:dinner 8f3a")).toBe(false);
  });

  it("does not match a memo with special characters", () => {
    expect(MERGEPAY_MEMO_REGEX.test("MP:dinner@8f3a")).toBe(false);
    expect(MERGEPAY_MEMO_REGEX.test("MP:dinner.8f3a")).toBe(false);
  });

  it("does not match an empty code after MP:", () => {
    expect(MERGEPAY_MEMO_REGEX.test("MP:")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. sanitizeMemoInput
// ---------------------------------------------------------------------------

describe("sanitizeMemoInput — input cleaning before validation/parsing", () => {
  it("returns an empty string for null", () => {
    expect(sanitizeMemoInput(null)).toBe("");
  });

  it("returns an empty string for undefined", () => {
    expect(sanitizeMemoInput(undefined)).toBe("");
  });

  it("returns an empty string for an empty string", () => {
    expect(sanitizeMemoInput("")).toBe("");
  });

  it("strips ASCII NUL (\\x00) from the middle of the input", () => {
    expect(sanitizeMemoInput("MP:da\x00ta")).toBe("MP:data");
  });

  it("strips every C0 control character class (\\x00–\\x1f)", () => {
    for (let code = 0x00; code <= 0x1f; code++) {
      const ctrl = String.fromCharCode(code);
      expect(sanitizeMemoInput(`MP:da${ctrl}ta`)).toBe("MP:data");
    }
  });

  it("strips DEL (\\x7f)", () => {
    expect(sanitizeMemoInput("MP:da\x7fta")).toBe("MP:data");
  });

  it("strips C1 control characters (\\x80–\\x9f)", () => {
    for (let code = 0x80; code <= 0x9f; code++) {
      const ctrl = String.fromCharCode(code);
      const result = sanitizeMemoInput(`MP:da${ctrl}ta`);
      expect(result).toBe("MP:data");
    }
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeMemoInput("  MP:dinner-8f3a  ")).toBe("MP:dinner-8f3a");
  });

  it("collapses multiple internal whitespace characters into a single space", () => {
    expect(sanitizeMemoInput("MP:  dinner   8f3a")).toBe("MP: dinner 8f3a");
  });

  it("handles a memo padded with tabs and newlines", () => {
    expect(sanitizeMemoInput("\t\nMP:lunch-1a2b\n\t")).toBe("MP:lunch-1a2b");
  });

  it("removes embedded control chars and recovers a clean parseable memo", () => {
    const dirty = "  MP:dinner-\t\x00\x078f3a  ";
    const clean = sanitizeMemoInput(dirty);
    expect(clean).toBe("MP:dinner-8f3a");
    // The sanitized output must be parseable
    expect(parseSettlementMemo(clean).valid).toBe(true);
  });

  it("preserves multi-byte UTF-8 characters while stripping control chars", () => {
    expect(sanitizeMemoInput("  MP:café-10€  ")).toBe("MP:café-10€");
  });

  it("returns unchanged printable ASCII strings without surrounding whitespace", () => {
    expect(sanitizeMemoInput("MP:settle-abcd")).toBe("MP:settle-abcd");
  });
});

// ---------------------------------------------------------------------------
// 10. validateMemo — Stellar byte constraints
// ---------------------------------------------------------------------------

describe("validateMemo — Stellar memo byte constraints", () => {
  it("accepts a valid ASCII memo", () => {
    expect(validateMemo("MP:dinner-8f3a").valid).toBe(true);
  });

  it("accepts a memo at exactly 28 bytes (ASCII)", () => {
    const memo = "A".repeat(28);
    const result = validateMemo(memo);
    expect(result.valid).toBe(true);
    expect(result.byteLength).toBe(28);
  });

  it("rejects a memo at 29 bytes (one over the limit)", () => {
    const memo = "A".repeat(29);
    const result = validateMemo(memo);
    expect(result.valid).toBe(false);
    expect(result.byteLength).toBe(29);
    expect(result.error).toMatch(/28 bytes/);
  });

  it("accounts for multi-byte UTF-8 in byte count — 7 × 🌟 (4 bytes) = 28 bytes", () => {
    const valid = "🌟".repeat(7);
    const result = validateMemo(valid);
    expect(result.valid).toBe(true);
    expect(result.byteLength).toBe(28);
  });

  it("rejects 8 × 🌟 (32 bytes) as over the limit", () => {
    const over = "🌟".repeat(8);
    const result = validateMemo(over);
    expect(result.valid).toBe(false);
    expect(result.byteLength).toBe(32);
  });

  it("rejects null, undefined, empty string, and whitespace-only", () => {
    expect(validateMemo(null).valid).toBe(false);
    expect(validateMemo(undefined).valid).toBe(false);
    expect(validateMemo("").valid).toBe(false);
    expect(validateMemo("   ").valid).toBe(false);
  });

  it("rejects every ASCII and C1 control character", () => {
    const controls = [
      "\x00", "\x07", "\x08", "\x09", "\x0a", "\x0d",
      "\x1b", "\x1f", "\x7f", "\x85", "\x9f",
    ];
    for (const ctrl of controls) {
      const result = validateMemo(`MP:te${ctrl}st`);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/control characters/i);
    }
  });
});

// ---------------------------------------------------------------------------
// 11. validateShortCode — short code boundary conditions
// ---------------------------------------------------------------------------

describe("validateShortCode — code-portion boundary conditions", () => {
  it("accepts a minimal 1-character code", () => {
    expect(validateShortCode("a").valid).toBe(true);
  });

  it("accepts a code at exactly 25 bytes", () => {
    const maxCode = "a".repeat(MAX_SHORT_CODE_BYTES);
    const result = validateShortCode(maxCode);
    expect(result.valid).toBe(true);
    expect(result.byteLength).toBe(25);
  });

  it("rejects a code at 26 bytes (one over budget)", () => {
    const overCode = "a".repeat(MAX_SHORT_CODE_BYTES + 1);
    const result = validateShortCode(overCode);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/25 bytes/i);
  });

  it("rejects null, undefined, and empty string", () => {
    expect(validateShortCode(null).valid).toBe(false);
    expect(validateShortCode(undefined).valid).toBe(false);
    expect(validateShortCode("").valid).toBe(false);
  });

  it("rejects codes with leading whitespace", () => {
    expect(validateShortCode(" dinner-8f3a").valid).toBe(false);
  });

  it("rejects codes with trailing whitespace", () => {
    expect(validateShortCode("dinner-8f3a ").valid).toBe(false);
  });

  it("rejects codes that embed the MP: prefix", () => {
    expect(validateShortCode("MP:nested").valid).toBe(false);
  });

  it("rejects codes with control characters", () => {
    expect(validateShortCode("code\x00here").valid).toBe(false);
    expect(validateShortCode("code\x7fhere").valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 12. Zod schema boundaries
// ---------------------------------------------------------------------------

describe("stellarTextMemoSchema — Zod validation boundaries", () => {
  it("accepts a standard printable ASCII memo", () => {
    expect(stellarTextMemoSchema.safeParse("Hello Stellar").success).toBe(true);
  });

  it("accepts a memo at exactly the 28-byte boundary", () => {
    expect(stellarTextMemoSchema.safeParse("A".repeat(28)).success).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(stellarTextMemoSchema.safeParse("").success).toBe(false);
  });

  it("rejects a memo at 29 bytes", () => {
    expect(stellarTextMemoSchema.safeParse("a".repeat(29)).success).toBe(false);
  });

  it("rejects a memo containing a NUL byte", () => {
    expect(stellarTextMemoSchema.safeParse("bad\x00memo").success).toBe(false);
  });

  it("rejects a memo containing other control characters", () => {
    expect(stellarTextMemoSchema.safeParse("bad\x1fmemo").success).toBe(false);
    expect(stellarTextMemoSchema.safeParse("bad\x7fmemo").success).toBe(false);
  });

  it("accepts a generated settlement memo", () => {
    const memo = buildSettlementMemo(generateShortCode("Lunch", "12.00"))!;
    expect(stellarTextMemoSchema.safeParse(memo).success).toBe(true);
  });
});

describe("mergepaySettlementMemoSchema — Zod MP: structure enforcement", () => {
  it("accepts a valid MP: settlement memo", () => {
    expect(mergepaySettlementMemoSchema.safeParse("MP:dinner-8f3a").success).toBe(
      true
    );
  });

  it("accepts the maximum-length 28-byte settlement memo", () => {
    const maxMemo = `MP:${"a".repeat(MAX_SHORT_CODE_BYTES)}`;
    expect(new TextEncoder().encode(maxMemo).length).toBe(28);
    expect(mergepaySettlementMemoSchema.safeParse(maxMemo).success).toBe(true);
  });

  it("rejects a memo that is 1 byte over the 28-byte limit", () => {
    const over = `MP:${"a".repeat(MAX_SHORT_CODE_BYTES + 1)}`;
    expect(mergepaySettlementMemoSchema.safeParse(over).success).toBe(false);
  });

  it("rejects a memo missing the MP: prefix", () => {
    expect(mergepaySettlementMemoSchema.safeParse("dinner-8f3a").success).toBe(
      false
    );
  });

  it("rejects MP: followed by nothing (empty code)", () => {
    expect(mergepaySettlementMemoSchema.safeParse("MP:").success).toBe(false);
  });

  it("rejects a memo with a duplicate MP: prefix in the code", () => {
    expect(mergepaySettlementMemoSchema.safeParse("MP:MP:dinner").success).toBe(
      false
    );
  });

  it("rejects a memo containing control characters", () => {
    expect(
      mergepaySettlementMemoSchema.safeParse("MP:dinner\x00-8f3a").success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 13. Constants sanity check
// ---------------------------------------------------------------------------

describe("memo constants — structural guarantees", () => {
  it("STELLAR_MEMO_MAX_BYTES is 28 (Stellar protocol constant)", () => {
    expect(STELLAR_MEMO_MAX_BYTES).toBe(28);
  });

  it("PREFIX_BYTES is 3 (length of 'MP:' in UTF-8)", () => {
    expect(PREFIX_BYTES).toBe(3);
    expect(new TextEncoder().encode("MP:").length).toBe(3);
  });

  it("MAX_SHORT_CODE_BYTES is 25", () => {
    expect(MAX_SHORT_CODE_BYTES).toBe(25);
  });

  it("PREFIX_BYTES + MAX_SHORT_CODE_BYTES equals STELLAR_MEMO_MAX_BYTES", () => {
    expect(PREFIX_BYTES + MAX_SHORT_CODE_BYTES).toBe(STELLAR_MEMO_MAX_BYTES);
  });
});

// ---------------------------------------------------------------------------
// 14. Cross-validator 28-byte consistency boundary
// ---------------------------------------------------------------------------

describe("cross-validator byte-boundary consistency", () => {
  it("all validators agree that a 28-byte memo is valid", () => {
    const maxMemo = `MP:${"a".repeat(MAX_SHORT_CODE_BYTES)}`;
    expect(new TextEncoder().encode(maxMemo).length).toBe(28);

    expect(validateMemo(maxMemo).valid).toBe(true);
    expect(stellarTextMemoSchema.safeParse(maxMemo).success).toBe(true);
    expect(mergepaySettlementMemoSchema.safeParse(maxMemo).success).toBe(true);
    expect(parseSettlementMemo(maxMemo).valid).toBe(true);
    expect(isValidMergepayMemo(maxMemo)).toBe(true);
    expect(verifyTransactionMemo(maxMemo).severity).toBe("none");
  });

  it("all validators agree that a 29-byte memo is invalid", () => {
    const over = `MP:${"a".repeat(MAX_SHORT_CODE_BYTES + 1)}`; // 29 bytes
    expect(new TextEncoder().encode(over).length).toBe(29);

    expect(validateMemo(over).valid).toBe(false);
    expect(stellarTextMemoSchema.safeParse(over).success).toBe(false);
    expect(mergepaySettlementMemoSchema.safeParse(over).success).toBe(false);
    expect(parseSettlementMemo(over).valid).toBe(false);
    expect(isValidMergepayMemo(over)).toBe(false);
    expect(verifyTransactionMemo(over).severity).toBe("invalid_length");
  });
});

// ---------------------------------------------------------------------------
// 15. Full lifecycle round-trips — generate → build → parse → verify → extract
// ---------------------------------------------------------------------------

describe("full lifecycle round-trips", () => {
  it("round-trips a standard expense through the complete memo pipeline", () => {
    const label = "Dinner at Terra Kulture";
    const amount = "150.0000000";

    // 1. Generate a short code
    const shortCode = generateShortCode(label, amount);
    expect(shortCode).toMatch(/^[a-z0-9-]+$/);
    expect(shortCode.length).toBeLessThanOrEqual(MAX_SHORT_CODE_BYTES);

    // 2. Build the settlement memo
    const memo = buildSettlementMemo(shortCode)!;
    expect(memo).toMatch(/^MP:/);
    expect(new TextEncoder().encode(memo).length).toBeLessThanOrEqual(
      STELLAR_MEMO_MAX_BYTES
    );

    // 3. Validate the memo at the Stellar byte level
    expect(validateMemo(memo).valid).toBe(true);

    // 4. Parse it back into prefix + short code
    const parsed = parseSettlementMemo(memo);
    expect(parsed.valid).toBe(true);
    expect(parsed.shortCode).toBe(shortCode);
    expect(parsed.prefix).toBe("MP:");

    // 5. Break it down with the expected code — no warnings
    const bd = breakdownMemo(memo, shortCode);
    expect(bd.conformsToConvention).toBe(true);
    expect(bd.warnings).toHaveLength(0);

    // 6. Deviation detection — identical strings → no warnings
    expect(detectMemoDeviations(memo, shortCode)).toHaveLength(0);

    // 7. High-level UI verification
    expect(verifyTransactionMemo(memo, shortCode).severity).toBe("none");
    expect(isValidMergepayMemo(memo)).toBe(true);

    // 8. Zod schema acceptance
    expect(mergepaySettlementMemoSchema.safeParse(memo).success).toBe(true);

    // 9. Extraction from a Horizon-style payload
    const extracted = extractSettlementFromTransactionPayload({
      memo,
      memo_type: "text",
    });
    expect(extracted.matched).toBe(true);
    expect(extracted.shortCode).toBe(shortCode);

    // 10. Slug/suffix decomposition
    const ref = extractExpenseReferenceFromMemo(memo);
    expect(ref.valid).toBe(true);
    expect(ref.shortCode).toBe(shortCode);
  });

  it("handles a label with only special/non-ASCII characters through the full pipeline", () => {
    const label = "Crème Brûlée & Café ☕";
    const amount = "1234.5678901";
    const shortCode = generateShortCode(label, amount);

    // Slug must be pure ASCII
    expect(shortCode).toMatch(/^[a-z0-9-]+$/);

    const memo = buildSettlementMemo(shortCode)!;
    expect(memo).not.toBeNull();
    expect(validateMemo(memo).valid).toBe(true);
    expect(isValidMergepayMemo(memo)).toBe(true);
    expect(verifyTransactionMemo(memo, shortCode).severity).toBe("none");
    expect(detectMemoDeviations(memo, shortCode)).toHaveLength(0);
    expect(extractSettlementFromTransactionPayload({ memo }).matched).toBe(true);
  });

  it("handles an emoji-only label through the full pipeline (fallback to 'settle')", () => {
    const shortCode = generateShortCode("🎉🎊🎈", "50.00");
    expect(shortCode).toMatch(/^settle-[0-9a-f]{4}$/);

    const memo = buildSettlementMemo(shortCode)!;
    expect(validateMemo(memo).valid).toBe(true);
    expect(parseSettlementMemo(memo).shortCode).toBe(shortCode);
    expect(verifyTransactionMemo(memo, shortCode).severity).toBe("none");
  });

  it("handles a very long label (slug capped at 16 chars) through the full pipeline", () => {
    const label =
      "This is an extremely long expense description that far exceeds any reasonable limit";
    const shortCode = generateShortCode(label, "999.99");

    const slug = shortCode.split("-").slice(0, -1).join("-");
    expect(slug.length).toBeLessThanOrEqual(16);

    const memo = buildSettlementMemo(shortCode)!;
    expect(validateMemo(memo).valid).toBe(true);
    expect(parseSettlementMemo(memo).shortCode).toBe(shortCode);
    expect(isValidMergepayMemo(memo)).toBe(true);
  });

  it("sanitizes a dirty Horizon memo and completes the extraction pipeline", () => {
    const code = generateShortCode("Groceries", "25.00");
    const cleanMemo = buildSettlementMemo(code)!;
    const dirtyMemo = `  ${cleanMemo.slice(0, 5)}\x00\x07${cleanMemo.slice(5)}  `;

    const clean = sanitizeMemoInput(dirtyMemo);
    expect(clean).toBe(cleanMemo);

    const parsed = parseSettlementMemo(clean);
    expect(parsed.valid).toBe(true);
    expect(parsed.shortCode).toBe(code);
  });

  it("keeps the generate → build → extract result consistent with the original code", () => {
    const pairs = [
      ["Grocery run", "42.00"],
      ["Monthly rent", "1500.00"],
      ["Flight tickets", "350.99"],
      ["Coffee & snacks", "8.50"],
    ];

    for (const [label, amount] of pairs) {
      const code = generateShortCode(label, amount);
      const memo = buildSettlementMemo(code)!;
      const res = extractSettlementFromTransactionPayload({ memo });
      expect(res.matched).toBe(true);
      expect(res.shortCode).toBe(code);
    }
  });
});
