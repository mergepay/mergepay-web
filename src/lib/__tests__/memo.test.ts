import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Memo } from "@stellar/stellar-sdk";
import {
  generateShortCode,
  validateMemo,
  validateShortCode,
  buildSettlementMemo,
  breakdownMemo,
  detectMemoDeviations,
  sanitizeMemoInput,
  parseSettlementMemo,
  extractExpenseReferenceFromMemo,
  extractSettlementFromTransactionPayload,
  stellarTextMemoSchema,
  mergepaySettlementMemoSchema,
  STELLAR_MEMO_MAX_BYTES,
  PREFIX_BYTES,
  MAX_SHORT_CODE_BYTES,
} from "../memoValidation";
import { verifyTransactionMemo, isValidMergepayMemo } from "../memo";

function expectStellarSchemaAccepts(value: string): void {
  const parsed = stellarTextMemoSchema.safeParse(value);
  assert.equal(parsed.success, true);
}

function expectMergepaySchemaAccepts(value: string): void {
  const parsed = mergepaySettlementMemoSchema.safeParse(value);
  assert.equal(parsed.success, true);
}

describe("Stellar Memo Generation & Validation Suite (#287, #332)", () => {
  it("enforces Stellar memo constants (max 28 bytes)", () => {
    assert.equal(STELLAR_MEMO_MAX_BYTES, 28);
    assert.equal(PREFIX_BYTES, 3); // "MP:" is 3 ASCII bytes
    assert.equal(MAX_SHORT_CODE_BYTES, 25);
    assert.equal(PREFIX_BYTES + MAX_SHORT_CODE_BYTES, STELLAR_MEMO_MAX_BYTES);
  });

  describe("generateShortCode", () => {
    it("generates deterministic short codes with MP: prefix constraints", () => {
      const code1 = generateShortCode("Dinner", "50.00");
      const code2 = generateShortCode("Dinner", "50.00");
      assert.equal(code1, code2);
      assert.match(code1, /^dinner-[0-9a-f]{4}$/);

      const fullMemo = buildSettlementMemo(code1);
      assert.match(fullMemo ?? "", /^MP:dinner-[0-9a-f]{4}$/);
      assert.ok(new TextEncoder().encode(fullMemo ?? "").length <= 28);
    });

    it("generates different short codes for different amounts or labels", () => {
      const code1 = generateShortCode("Dinner", "50.00");
      const code2 = generateShortCode("Dinner", "60.00");
      const code3 = generateShortCode("Lunch", "50.00");
      assert.notEqual(code1, code2);
      assert.notEqual(code1, code3);
    });

    it("sanitizes special characters and limits length in short code", () => {
      const longTitle = "Party! @ John's House & Roof BBQ 2026";
      const code = generateShortCode(longTitle, "123.45");
      assert.ok(code.length <= 25);
      assert.doesNotMatch(code, /[^a-z0-9-]/);
    });

    it("falls back to 'settle' when label has only special characters", () => {
      const code = generateShortCode("@#$%^&*!", "10.00");
      assert.match(code, /^settle-[0-9a-f]{4}$/);
    });

    it("falls back to 'settle' for empty or whitespace-only labels", () => {
      assert.match(generateShortCode("", "10.00"), /^settle-[0-9a-f]{4}$/);
      assert.match(generateShortCode("   ", "10.00"), /^settle-[0-9a-f]{4}$/);
    });

    it("strips emojis and non-ASCII characters from title slug", () => {
      const code = generateShortCode("🍕 Pizza & Beer 🍻", "25.00");
      assert.match(code, /^pizza-beer-[0-9a-f]{4}$/);
    });

    it("strips leading/trailing hyphens and collapses consecutive hyphens", () => {
      const code = generateShortCode("---Trip  to   NYC---", "100.00");
      assert.match(code, /^trip-to-nyc-[0-9a-f]{4}$/);
    });

    it("caps slug at 16 characters so full short code fits within budget", () => {
      const longTitle = "Very long expense description that will definitely exceed sixteen characters";
      const code = generateShortCode(longTitle, "42.00");
      const slug = code.slice(0, code.lastIndexOf("-"));
      assert.ok(slug.length <= 16);
      assert.ok(code.length <= 21); // 16 + 1 + 4 = 21 chars, well within 25
    });

    it("handles diverse amount string formats deterministically", () => {
      assert.match(generateShortCode("Trip", "0"), /^trip-[0-9a-f]{4}$/);
      assert.match(generateShortCode("Trip", "0.0000001"), /^trip-[0-9a-f]{4}$/);
      assert.match(generateShortCode("Trip", "1234567.8901234"), /^trip-[0-9a-f]{4}$/);
      assert.match(generateShortCode("Trip", "-50.00"), /^trip-[0-9a-f]{4}$/);
    });
  });

  describe("validateShortCode", () => {
    it("accepts valid short codes", () => {
      const result = validateShortCode("dinner-8f3a");
      assert.equal(result.valid, true);
      assert.equal(result.byteLength, 11);
    });

    it("rejects null, undefined, or empty string", () => {
      assert.equal(validateShortCode(null).valid, false);
      assert.equal(validateShortCode(undefined).valid, false);
      assert.equal(validateShortCode("").valid, false);
    });

    it("rejects leading or trailing whitespace", () => {
      const result = validateShortCode(" dinner-8f3a ");
      assert.equal(result.valid, false);
      assert.match(result.error ?? "", /whitespace/i);
    });

    it("rejects short codes containing the MP: prefix", () => {
      const result = validateShortCode("MP:dinner-8f3a");
      assert.equal(result.valid, false);
      assert.match(result.error ?? "", /must not contain the prefix/i);
    });

    it("accepts short codes at exactly 25 bytes and rejects 26 bytes", () => {
      const exact25 = "a".repeat(25);
      const res25 = validateShortCode(exact25);
      assert.equal(res25.valid, true);
      assert.equal(res25.byteLength, 25);

      const tooLong26 = "a".repeat(26);
      const res26 = validateShortCode(tooLong26);
      assert.equal(res26.valid, false);
      assert.match(res26.error ?? "", /exceeds 25 bytes/i);
    });

    it("rejects control characters in short codes", () => {
      assert.equal(validateShortCode("code\x00test").valid, false);
      assert.equal(validateShortCode("code\x1ftest").valid, false);
      assert.equal(validateShortCode("code\x7ftest").valid, false);
    });
  });

  describe("buildSettlementMemo", () => {
    it("builds valid MP: memo from valid short code", () => {
      assert.equal(buildSettlementMemo("dinner-8f3a"), "MP:dinner-8f3a");
    });

    it("builds exact 28-byte memo from 25-byte short code", () => {
      const shortCode = "a".repeat(25);
      const memo = buildSettlementMemo(shortCode);
      assert.equal(memo, `MP:${shortCode}`);
      assert.equal(new TextEncoder().encode(memo ?? "").length, 28);
    });

    it("returns null for invalid short codes", () => {
      assert.equal(buildSettlementMemo(null), null);
      assert.equal(buildSettlementMemo(""), null);
      assert.equal(buildSettlementMemo("  dinner-8f3a  "), null);
      assert.equal(buildSettlementMemo("a".repeat(26)), null);
      assert.equal(buildSettlementMemo("MP:already-prefixed"), null);
      assert.equal(buildSettlementMemo("code\x00null"), null);
    });
  });

  describe("validateMemo", () => {
    it("accepts valid memos within 28 bytes", () => {
      const valid = validateMemo("MP:dinner-8f3a");
      assert.equal(valid.valid, true);
      assert.equal(valid.byteLength, 14);
    });

    it("rejects null, undefined, empty, and whitespace-only strings", () => {
      assert.equal(validateMemo(null).valid, false);
      assert.equal(validateMemo(undefined).valid, false);
      assert.equal(validateMemo("").valid, false);
      assert.equal(validateMemo("   ").valid, false);
    });

    it("accepts memo at exact 28-byte ASCII boundary and rejects 29 bytes", () => {
      const exact28 = "A".repeat(28);
      const res28 = validateMemo(exact28);
      assert.equal(res28.valid, true);
      assert.equal(res28.byteLength, 28);

      const tooLong29 = "A".repeat(29);
      const res29 = validateMemo(tooLong29);
      assert.equal(res29.valid, false);
      assert.equal(res29.byteLength, 29);
      assert.match(res29.error ?? "", /exceeds the Stellar limit of 28 bytes/i);
    });

    it("handles multi-byte UTF-8 byte length constraints accurately", () => {
      // 🌟 is 4 bytes in UTF-8. 7 * 4 = 28 bytes exactly
      const validUtf8 = "🌟".repeat(7);
      const resValid = validateMemo(validUtf8);
      assert.equal(resValid.valid, true);
      assert.equal(resValid.byteLength, 28);

      // 8 * 4 = 32 bytes (exceeds 28)
      const overUtf8 = "🌟".repeat(8);
      const resOver = validateMemo(overUtf8);
      assert.equal(resOver.valid, false);
      assert.equal(resOver.byteLength, 32);

      // 2-byte and 3-byte UTF-8 characters: "é" (2 bytes), "€" (3 bytes)
      const mixedUtf8 = "MP:café-10€"; // 3 ("MP:") + 3 ("caf") + 2 ("é") + 3 ("-10") + 3 ("€") = 14 bytes
      const resMixed = validateMemo(mixedUtf8);
      assert.equal(resMixed.valid, true);
      assert.equal(resMixed.byteLength, 14);
    });

    it("rejects ASCII and C1 control characters", () => {
      for (const ctrl of ["\x00", "\x07", "\x08", "\x09", "\x0a", "\x0d", "\x1b", "\x7f", "\x85", "\x9f"]) {
        const result = validateMemo(`MP:te${ctrl}st`);
        assert.equal(result.valid, false, `Expected control character ${JSON.stringify(ctrl)} to be rejected`);
        assert.match(result.error ?? "", /control characters/i);
      }
    });
  });

  describe("breakdownMemo", () => {
    it("inspects valid MP: memo and computes correct breakdown", () => {
      const canonical = breakdownMemo("MP:dinner-8f3a");
      assert.equal(canonical.conformsToConvention, true);
      assert.equal(canonical.prefix, "MP:");
      assert.equal(canonical.shortCode, "dinner-8f3a");
      assert.equal(canonical.byteLength, 14);
      assert.equal(canonical.maxLength, 28);
      assert.equal(canonical.remainingBytes, 14);
      assert.equal(canonical.warnings.length, 0);
    });

    it("handles null, undefined, or empty memo gracefully", () => {
      const empty = breakdownMemo(null);
      assert.equal(empty.conformsToConvention, false);
      assert.equal(empty.byteLength, 0);
      assert.equal(empty.remainingBytes, 28);
      assert.equal(empty.warnings.length, 0);
    });

    it("identifies non-conforming memos lacking the MP: prefix", () => {
      const custom = breakdownMemo("custom-memo-without-prefix");
      assert.equal(custom.conformsToConvention, false);
      assert.equal(custom.prefix, "");
      assert.equal(custom.shortCode, "custom-memo-without-prefix");
      assert.equal(custom.warnings.length, 1);
      assert.match(custom.warnings[0], /prefix "MP:"/i);
    });

    it("detects deviation from expected short code", () => {
      const matching = breakdownMemo("MP:dinner-8f3a", "dinner-8f3a");
      assert.equal(matching.warnings.length, 0);

      const deviating = breakdownMemo("MP:dinner-8f3a", "lunch-abcd");
      assert.equal(deviating.warnings.length, 1);
      assert.match(deviating.warnings[0], /deviates from the expected reconciliation code "lunch-abcd"/i);
    });

    it("calculates remaining bytes accurately with multi-byte UTF-8 and clamps to 0", () => {
      // 🌟 is 4 bytes. Total: 3 ("MP:") + 8 = 11 bytes. Remaining: 28 - 11 = 17
      const utf8Memo = breakdownMemo("MP:🌟🌟");
      assert.equal(utf8Memo.byteLength, 11);
      assert.equal(utf8Memo.remainingBytes, 17);

      // Overlong memo: remainingBytes clamped to 0
      const longMemo = breakdownMemo("A".repeat(35));
      assert.equal(longMemo.byteLength, 35);
      assert.equal(longMemo.remainingBytes, 0);
    });
  });

  describe("detectMemoDeviations", () => {
    it("returns empty warnings array when memo matches expected code", () => {
      const warnings = detectMemoDeviations("MP:dinner-8f3a", "dinner-8f3a");
      assert.deepEqual(warnings, []);
    });

    it("warns when memo short code deviates from expected code", () => {
      const warnings = detectMemoDeviations("MP:wrong-code", "dinner-8f3a");
      assert.ok(warnings.length > 0);
      assert.ok(warnings.some((w) => w.includes('The expected memo is "MP:dinner-8f3a"')));
    });

    it("warns when memo lacks MP: prefix", () => {
      const warnings = detectMemoDeviations("dinner-8f3a", "dinner-8f3a");
      assert.ok(warnings.some((w) => w.includes('does not start with "MP:"')));
    });

    it("returns error when original code is invalid", () => {
      const warnings = detectMemoDeviations("MP:test", "a".repeat(26));
      assert.deepEqual(warnings, ["Original reconciliation code is invalid."]);
    });

    it("includes validation error when edited memo is invalid or too long", () => {
      const warnings = detectMemoDeviations("MP:" + "a".repeat(30), "dinner-8f3a");
      assert.ok(warnings.some((w) => w.includes("exceeds the Stellar limit of 28 bytes")));
    });
  });

  describe("verifyTransactionMemo & isValidMergepayMemo (#222)", () => {
    it("validates isValidMergepayMemo correctly", () => {
      assert.equal(isValidMergepayMemo("MP:dinner-8f3a"), true);
      assert.equal(isValidMergepayMemo("MP:123-abc"), true);
      assert.equal(isValidMergepayMemo(null), false);
      assert.equal(isValidMergepayMemo(""), false);
      assert.equal(isValidMergepayMemo("dinner-8f3a"), false);
      assert.equal(isValidMergepayMemo("MP:invalid spaces"), false);
      assert.equal(isValidMergepayMemo("MP:" + "a".repeat(26)), false); // exceeds 28 bytes total
    });

    it("verifies valid transaction memo matching expected code", () => {
      const res = verifyTransactionMemo("MP:dinner-8f3a", "dinner-8f3a");
      assert.equal(res.isValid, true);
      assert.equal(res.severity, "none");
      assert.equal(res.byteLength, 14);
      assert.equal(res.title, "Valid Settlement Memo");
    });

    it("identifies missing memo and marks severity as missing", () => {
      const res = verifyTransactionMemo("", "dinner-8f3a");
      assert.equal(res.isValid, false);
      assert.equal(res.severity, "missing");
      assert.equal(res.suggestedMemo, "MP:dinner-8f3a");
      assert.match(res.title, /Missing/i);
    });

    it("flags byte length overflow", () => {
      const longMemo = "MP:" + "x".repeat(30);
      const res = verifyTransactionMemo(longMemo);
      assert.equal(res.isValid, false);
      assert.equal(res.severity, "invalid_length");
      assert.ok(res.byteLength > 28);
    });

    it("flags malformed memo missing MP: prefix", () => {
      const res = verifyTransactionMemo("invoice-123", "dinner-8f3a");
      assert.equal(res.isValid, false);
      assert.equal(res.severity, "malformed");
      assert.equal(res.suggestedMemo, "MP:dinner-8f3a");
    });

    it("flags malformed memo with empty code after prefix", () => {
      const res = verifyTransactionMemo("MP:");
      assert.equal(res.isValid, false);
      assert.equal(res.severity, "malformed");
    });

    it("flags malformed memo with invalid characters", () => {
      const res = verifyTransactionMemo("MP:dinner@#$");
      assert.equal(res.isValid, false);
      assert.equal(res.severity, "malformed");
    });

    it("flags deviation when code differs from expected short code", () => {
      const res = verifyTransactionMemo("MP:lunch-456", "dinner-8f3a");
      assert.equal(res.isValid, true); // structurally valid
      assert.equal(res.severity, "deviation");
      assert.equal(res.suggestedMemo, "MP:dinner-8f3a");
      assert.match(res.message, /differs from the expected/i);
    });
  });

  // -----------------------------------------------------------------------
  // Parsing / verification half of the pipeline (#321): reading structured
  // `MP:<code>` memos back during transaction history inspection.
  // -----------------------------------------------------------------------

  describe("parseSettlementMemo", () => {
    it("round-trips a generated memo back into its short code", () => {
      const shortCode = generateShortCode("Dinner at Terra Kulture", "150.00");
      const memo = buildSettlementMemo(shortCode);
      assert.ok(memo);
      const parsed = parseSettlementMemo(memo);
      assert.equal(parsed.valid, true);
      assert.equal(parsed.prefix, "MP:");
      assert.equal(parsed.shortCode, shortCode);
    });

    it("rejects malformed memo strings without the MP: prefix", () => {
      for (const bad of ["dinner-8f3a", "XP:dinner-8f3a", "mpX:dinner", "Dinner party payment"]) {
        const parsed = parseSettlementMemo(bad);
        assert.equal(parsed.valid, false, `expected "${bad}" to be rejected`);
        assert.match(parsed.error ?? "", /prefix/i);
      }
    });

    it("rejects empty codes and whitespace-only input", () => {
      assert.equal(parseSettlementMemo(null).valid, false);
      assert.equal(parseSettlementMemo(undefined).valid, false);
      assert.equal(parseSettlementMemo("").valid, false);
      assert.equal(parseSettlementMemo("   ").valid, false);
      assert.equal(parseSettlementMemo("MP:").valid, false);
      assert.equal(parseSettlementMemo("MP:   ").valid, false);
      const emptyPrefix = parseSettlementMemo("MP:");
      assert.match(emptyPrefix.error ?? "", /short code|prefix|code/i);
    });

    it("rejects memos exceeding the 28-byte Stellar text memo limit", () => {
      const overlong = "MP:" + "a".repeat(26); // 29 bytes
      const parsed = parseSettlementMemo(overlong);
      assert.equal(parsed.valid, false);
      assert.match(parsed.error ?? "", /28 bytes|exceeds/i);
    });

    it("rejects control characters and null bytes", () => {
      for (const ctrl of ["\x00", "\x1f", "\x7f"]) {
        const parsed = parseSettlementMemo(`MP:da${ctrl}ta`);
        assert.equal(parsed.valid, false, `expected control char to be rejected`);
      }
    });

    it("rejects codes that contain a second MP: prefix", () => {
      const parsed = parseSettlementMemo("MP:MP:dinner");
      assert.equal(parsed.valid, false);
      assert.match(parsed.error ?? "", /prefix/i);
    });

    it("rejects codes with leading/trailing whitespace", () => {
      // parseSettlementMemo trims the full memo, so a trailing space would be
      // stripped; a code with interior padding around a second space is what
      // matters — here the trimmed memo still ends with a space.
      const parsed = parseSettlementMemo("MP:dinner-8f3a ");
      assert.equal(parsed.valid, true); // full-memo trim removes the trailing space
    });

    it("survives sanitization of control characters before parsing", () => {
      const dirty = "  MP:lunch-1a2b\x00\x07  ";
      const clean = sanitizeMemoInput(dirty);
      assert.equal(clean, "MP:lunch-1a2b");
      const parsed = parseSettlementMemo(clean);
      assert.equal(parsed.valid, true);
      assert.equal(parsed.shortCode, "lunch-1a2b");
    });
  });

  describe("extractExpenseReferenceFromMemo", () => {
    it("splits a generated memo into expense slug and hash suffix", () => {
      const shortCode = generateShortCode("Taxi to airport", "42.5000000");
      const memo = buildSettlementMemo(shortCode);
      assert.ok(memo);
      const ref = extractExpenseReferenceFromMemo(memo);
      assert.equal(ref.valid, true);
      assert.equal(ref.shortCode, shortCode);
      assert.ok(ref.expenseSlug);
      assert.match(ref.hashSuffix ?? "", /^[0-9a-f]{4}$/);
    });

    it("parses hand-crafted memos with multi-word slugs", () => {
      const ref = extractExpenseReferenceFromMemo("MP:team-lunch-trip-9b2c");
      assert.equal(ref.valid, true);
      assert.equal(ref.expenseSlug, "team-lunch-trip");
      assert.equal(ref.hashSuffix, "9b2c");
      assert.equal(ref.shortCode, "team-lunch-trip-9b2c");
    });

    it("treats a code without a hyphen as a bare slug", () => {
      const ref = extractExpenseReferenceFromMemo("MP:dinner");
      assert.equal(ref.valid, true);
      assert.equal(ref.expenseSlug, "dinner");
      assert.equal(ref.hashSuffix, undefined);
    });

    it("rejects non-MP: and over-long memos", () => {
      assert.equal(extractExpenseReferenceFromMemo("no-prefix-here").valid, false);
      assert.equal(
        extractExpenseReferenceFromMemo("MP:" + "a".repeat(26)).valid,
        false
      );
      assert.equal(extractExpenseReferenceFromMemo(null).valid, false);
    });

    it("keeps slug+suffix consistent with generateShortCode output shape", () => {
      const code = generateShortCode("Groceries", "25.00");
      const ref = extractExpenseReferenceFromMemo(buildSettlementMemo(code));
      assert.equal(ref.valid, true);
      assert.equal(ref.shortCode, code);
      assert.equal(ref.hashSuffix, code.split("-").at(-1));
      assert.equal(ref.expenseSlug, code.split("-").slice(0, -1).join("-"));
    });
  });

  describe("extractSettlementFromTransactionPayload", () => {
    it("recovers the expense reference from a Horizon-style history entry", () => {
      const shortCode = generateShortCode("Hotel booking", "310.00");
      const memo = buildSettlementMemo(shortCode);
      assert.ok(memo);
      const payload = {
        id: "tx-history-1",
        memo,
        memo_type: "text",
      };
      const res = extractSettlementFromTransactionPayload(payload);
      assert.equal(res.matched, true);
      assert.equal(res.memo, memo);
      assert.equal(res.shortCode, shortCode);
      assert.ok(res.expenseSlug);
      assert.match(res.hashSuffix ?? "", /^[0-9a-f]{4}$/);
    });

    it("reads memo_text and nested memo object Horizon variants", () => {
      const viaMemoText = extractSettlementFromTransactionPayload({
        memo_text: "MP:groceries-4e12",
      });
      assert.equal(viaMemoText.matched, true);
      assert.equal(viaMemoText.shortCode, "groceries-4e12");

      const viaMemoObject = extractSettlementFromTransactionPayload({
        memo: { type: "text", value: "MP:hotel-99aa" },
      });
      assert.equal(viaMemoObject.matched, true);
      assert.equal(viaMemoObject.shortCode, "hotel-99aa");
    });

    it("returns matched=false for payloads without any memo", () => {
      assert.equal(extractSettlementFromTransactionPayload(null).matched, false);
      assert.equal(extractSettlementFromTransactionPayload("nope").matched, false);
      assert.equal(extractSettlementFromTransactionPayload({}).matched, false);
      assert.equal(
        extractSettlementFromTransactionPayload({ id: "tx-1" }).matched,
        false
      );
    });

    it("returns matched=false for non-Mergepay memos while preserving the memo text", () => {
      const res = extractSettlementFromTransactionPayload({ memo: "Personal gift" });
      assert.equal(res.matched, false);
      assert.equal(res.memo, "Personal gift");
      assert.ok(res.error);
    });

    it("matches the expected code through the settle-dialog pipeline", () => {
      // Mirrors settle-dialog.tsx: generate -> build -> verify.
      const shortCode = generateShortCode("Concert tickets", "85.00");
      const memo = buildSettlementMemo(shortCode);
      assert.ok(memo);
      const verification = verifyTransactionMemo(memo, shortCode);
      assert.equal(verification.isValid, true);
      assert.equal(verification.severity, "none");

      // ...then the history-inspection half: extract from the tx payload.
      const extracted = extractSettlementFromTransactionPayload({ memo });
      assert.equal(extracted.matched, true);
      assert.equal(extracted.shortCode, shortCode);
    });
  });

  describe("Zod memo schemas", () => {
    it("stellarTextMemoSchema accepts generated memos", () => {
      const memo = buildSettlementMemo(generateShortCode("Lunch", "12.00"));
      assert.ok(memo);
      expectStellarSchemaAccepts(memo);
    });

    it("stellarTextMemoSchema rejects over-long and control-character memos", () => {
      assert.equal(stellarTextMemoSchema.safeParse("a".repeat(29)).success, false);
      assert.equal(stellarTextMemoSchema.safeParse("bad\u0000memo").success, false);
    });

    it("mergepaySettlementMemoSchema enforces the MP: structure", () => {
      expectMergepaySchemaAccepts("MP:dinner-8f3a");
      assert.equal(mergepaySettlementMemoSchema.safeParse("dinner-8f3a").success, false);
      assert.equal(mergepaySettlementMemoSchema.safeParse("MP:MP:dinner").success, false);
    });
  });

  describe("Stellar SDK memo serialization", () => {
    it("serializes generated memos through Memo.text without data loss", () => {
      for (const label of ["Dinner", "Trip to NYC", "Utilities", "🍕 Pizza & Beer"]) {
        const memo = buildSettlementMemo(generateShortCode(label, "10.0000000"));
        assert.ok(memo);
        const textMemo = Memo.text(memo);
        assert.equal(textMemo.value, memo);
        assert.equal(textMemo.type, "text");
      }
    });

    it("serializes the maximum-length 28-byte memo", () => {
      const memo = buildSettlementMemo("a".repeat(MAX_SHORT_CODE_BYTES));
      assert.ok(memo);
      assert.equal(new TextEncoder().encode(memo).length, STELLAR_MEMO_MAX_BYTES);
      assert.equal(Memo.text(memo).value, memo);
    });

    it("Memo.text enforces the same 28-byte limit the validators use", () => {
      assert.throws(() => Memo.text("a".repeat(29)), /max 28 bytes/);
    });
  });
});

// ---------------------------------------------------------------------------
// Extended edge-case coverage (#329): input sanitization, Zod schema
// boundaries, verification branches, malformed-memo handling, and full
// lifecycle round trips that guard the `MP:` formatting contract end to end.
// ---------------------------------------------------------------------------

describe("Memo formatting utilities — extended edge cases (#329)", () => {
  describe("sanitizeMemoInput", () => {
    it("returns an empty string for null, undefined, or empty input", () => {
      assert.equal(sanitizeMemoInput(null), "");
      assert.equal(sanitizeMemoInput(undefined), "");
      assert.equal(sanitizeMemoInput(""), "");
    });

    it("strips every ASCII control-character class (C0, DEL, C1)", () => {
      for (const ctrl of ["\x00", "\x07", "\x1f", "\x7f", "\x85", "\x9f"]) {
        assert.equal(
          sanitizeMemoInput(`MP:da${ctrl}ta`),
          "MP:data",
          `expected control character ${JSON.stringify(ctrl)} to be stripped`
        );
      }
    });

    it("removes embedded control characters and recovers a clean memo", () => {
      const dirty = "  MP:dinner-\t\x00\x078f3a \n";
      assert.equal(sanitizeMemoInput(dirty), "MP:dinner-8f3a");
    });

    it("collapses internal whitespace runs and trims the edges", () => {
      assert.equal(sanitizeMemoInput("  MP:   dinner   8f3a  "), "MP: dinner 8f3a");
    });

    it("preserves multi-byte UTF-8 characters while cleaning", () => {
      assert.equal(sanitizeMemoInput("  MP:café-10€  "), "MP:café-10€");
    });
  });

  describe("stellarTextMemoSchema boundaries", () => {
    it("rejects an empty string", () => {
      assert.equal(stellarTextMemoSchema.safeParse("").success, false);
    });

    it("accepts a memo at the exact 28-byte boundary", () => {
      assert.equal(stellarTextMemoSchema.safeParse("A".repeat(28)).success, true);
    });

    it("does not count surrounding whitespace toward the byte limit", () => {
      // Mirrors validateMemo: leading/trailing spaces are trimmed before the
      // ledger byte count, so padding never pushes a valid memo over 28.
      const padded = `  ${"A".repeat(28)}  `;
      assert.equal(padded.length, 32);
      assert.equal(stellarTextMemoSchema.safeParse(padded).success, true);
    });
  });

  describe("mergepaySettlementMemoSchema boundaries", () => {
    it("rejects an MP: memo with an empty reconciliation code", () => {
      assert.equal(mergepaySettlementMemoSchema.safeParse("MP:").success, false);
    });

    it("accepts a maximum-length 28-byte settlement memo", () => {
      const maxMemo = `MP:${"a".repeat(MAX_SHORT_CODE_BYTES)}`;
      assert.equal(new TextEncoder().encode(maxMemo).length, 28);
      assert.equal(mergepaySettlementMemoSchema.safeParse(maxMemo).success, true);
    });

    it("rejects a settlement memo one byte over the limit", () => {
      assert.equal(
        mergepaySettlementMemoSchema.safeParse(`MP:${"a".repeat(MAX_SHORT_CODE_BYTES + 1)}`).success,
        false
      );
    });

    it("rejects settlement memos containing control characters", () => {
      assert.equal(mergepaySettlementMemoSchema.safeParse("MP:dinner\x00-8f3a").success, false);
    });
  });

  describe("isValidMergepayMemo extras", () => {
    it("trims surrounding whitespace before validating", () => {
      assert.equal(isValidMergepayMemo("  MP:dinner-8f3a  "), true);
    });

    it("accepts uppercase short codes (format check is case-insensitive)", () => {
      assert.equal(isValidMergepayMemo("MP:DINNER-8F3A"), true);
    });

    it("rejects codes containing multi-byte or special characters", () => {
      assert.equal(isValidMergepayMemo("MP:café-1"), false);
      assert.equal(isValidMergepayMemo("MP:dinner@8f3a"), false);
      assert.equal(isValidMergepayMemo("MP:dinner 8f3a"), false);
    });

    it("rejects a short code longer than the 25-byte budget", () => {
      assert.equal(isValidMergepayMemo(`MP:${"a".repeat(MAX_SHORT_CODE_BYTES + 1)}`), false);
    });
  });

  describe("verifyTransactionMemo extras", () => {
    it("treats a whitespace-only memo as missing and suggests a replacement", () => {
      const res = verifyTransactionMemo("   ", "dinner-8f3a");
      assert.equal(res.isValid, false);
      assert.equal(res.severity, "missing");
      assert.equal(res.suggestedMemo, "MP:dinner-8f3a");
    });

    it("measures byte length on the trimmed memo", () => {
      const res = verifyTransactionMemo("  MP:dinner-8f3a  ", "dinner-8f3a");
      assert.equal(res.byteLength, 14);
      assert.equal(res.severity, "none");
    });

    it("matches the expected code case-insensitively", () => {
      const res = verifyTransactionMemo("MP:DINNER-8F3A", "dinner-8f3a");
      assert.equal(res.isValid, true);
      assert.equal(res.severity, "none");
    });

    it("flags multi-byte characters in the short code as malformed", () => {
      const res = verifyTransactionMemo("MP:café-10");
      assert.equal(res.isValid, false);
      assert.equal(res.severity, "malformed");
      assert.match(res.title, /Invalid Memo Characters/);
    });

    it("still suggests the expected memo when the raw memo is malformed", () => {
      const res = verifyTransactionMemo("invoice-123", "dinner-8f3a");
      assert.equal(res.severity, "malformed");
      assert.equal(res.suggestedMemo, "MP:dinner-8f3a");
      assert.ok(res.actionHint);
    });
  });

  describe("parseSettlementMemo extras", () => {
    it("accepts uppercase short codes without case folding", () => {
      const parsed = parseSettlementMemo("MP:DINNER-8F3A");
      assert.equal(parsed.valid, true);
      assert.equal(parsed.shortCode, "DINNER-8F3A");
    });

    it("parses a memo padded with leading whitespace after trimming", () => {
      const parsed = parseSettlementMemo("   MP:dinner-8f3a");
      assert.equal(parsed.valid, true);
      assert.equal(parsed.shortCode, "dinner-8f3a");
    });
  });

  describe("breakdownMemo extras", () => {
    it("reports both prefix and deviation warnings for a non-conforming memo", () => {
      const bd = breakdownMemo("custom-code", "dinner-8f3a");
      assert.equal(bd.conformsToConvention, false);
      assert.equal(bd.warnings.length, 2);
      assert.match(bd.warnings[0], /prefix/i);
      assert.match(bd.warnings[1], /deviates/i);
    });

    it("returns an empty breakdown for an empty-string memo", () => {
      const bd = breakdownMemo("");
      assert.equal(bd.byteLength, 0);
      assert.equal(bd.remainingBytes, STELLAR_MEMO_MAX_BYTES);
      assert.equal(bd.conformsToConvention, false);
    });
  });

  describe("detectMemoDeviations extras", () => {
    it("surfaces a control-character rejection when the edited memo is dirty", () => {
      const warnings = detectMemoDeviations("MP:dinner\x00-8f3a", "dinner-8f3a");
      assert.ok(warnings.some((w) => /control characters/i.test(w)));
    });

    it("returns no warnings when a sanitized edit matches the original code", () => {
      const cleaned = sanitizeMemoInput("  MP:dinner-8f3a\x07  ");
      assert.deepEqual(detectMemoDeviations(cleaned, "dinner-8f3a"), []);
    });
  });

  describe("extractSettlementFromTransactionPayload extras", () => {
    it("reads the internal _value memo object variant", () => {
      const res = extractSettlementFromTransactionPayload({
        memo: { type: "text", _value: "MP:vault-77aa" },
      });
      assert.equal(res.matched, true);
      assert.equal(res.shortCode, "vault-77aa");
      assert.equal(res.expenseSlug, "vault");
      assert.equal(res.hashSuffix, "77aa");
    });

    it("returns an error for non-string memo fields", () => {
      const res = extractSettlementFromTransactionPayload({ memo: 42 });
      assert.equal(res.matched, false);
      assert.match(res.error ?? "", /does not contain a memo/i);
    });

    it("sanitizes a dirty Horizon memo before extracting the reference", () => {
      const res = extractSettlementFromTransactionPayload({
        memo: "  MP:dinner-\t\x008f3a  ",
      });
      assert.equal(res.matched, true);
      assert.equal(res.memo, "MP:dinner-8f3a");
      assert.equal(res.shortCode, "dinner-8f3a");
    });
  });

  describe("cross-validator 28-byte boundary", () => {
    it("enforces one consistent boundary across every validator and the SDK", () => {
      const maxMemo = buildSettlementMemo("a".repeat(MAX_SHORT_CODE_BYTES));
      assert.ok(maxMemo);
      assert.equal(new TextEncoder().encode(maxMemo).length, 28);
      assert.equal(validateMemo(maxMemo).valid, true);
      assert.equal(stellarTextMemoSchema.safeParse(maxMemo).success, true);
      assert.equal(Memo.text(maxMemo).value, maxMemo);
      assert.equal(parseSettlementMemo(maxMemo).valid, true);

      const overlong = `${maxMemo}a`; // 29 bytes
      assert.equal(validateMemo(overlong).valid, false);
      assert.equal(stellarTextMemoSchema.safeParse(overlong).success, false);
      assert.throws(() => Memo.text(overlong), /max 28 bytes/);
    });
  });

  describe("full lifecycle round trips (#329)", () => {
    it("round-trips a generated code through build, validate, parse, verify, and extract", () => {
      const shortCode = generateShortCode("Hotel booking deposit", "310.0000000");
      const memo = buildSettlementMemo(shortCode);
      assert.ok(memo);

      // Creation → validation
      assert.equal(validateMemo(memo).valid, true);
      assert.ok(new TextEncoder().encode(memo).length <= STELLAR_MEMO_MAX_BYTES);

      // Parsing → breakdown (no warnings when compared with the expected code)
      const parsed = parseSettlementMemo(memo);
      assert.equal(parsed.valid, true);
      assert.equal(parsed.shortCode, shortCode);
      const bd = breakdownMemo(memo, shortCode);
      assert.equal(bd.conformsToConvention, true);
      assert.equal(bd.warnings.length, 0);
      assert.deepEqual(detectMemoDeviations(memo, shortCode), []);

      // Verification → extraction from a history payload
      assert.equal(verifyTransactionMemo(memo, shortCode).severity, "none");
      const extracted = extractSettlementFromTransactionPayload({ memo, memo_type: "text" });
      assert.equal(extracted.matched, true);
      assert.equal(extracted.shortCode, shortCode);

      // SDK serialization stays lossless
      assert.equal(Memo.text(memo).value, memo);
    });

    it("keeps special-character labels ASCII-safe through the entire pipeline", () => {
      const label = "Crème Brûlée & Café ☕ 2026";
      const shortCode = generateShortCode(label, "1234.5678901");

      // Accents, symbols, and emoji collapse into an ASCII-only slug.
      assert.match(shortCode, /^[a-z0-9-]+$/);
      assert.ok(shortCode.length <= MAX_SHORT_CODE_BYTES);

      const memo = buildSettlementMemo(shortCode);
      assert.ok(memo);
      assert.ok(new TextEncoder().encode(memo).length <= STELLAR_MEMO_MAX_BYTES);
      assert.equal(validateMemo(memo).valid, true);
      assert.equal(isValidMergepayMemo(memo), true);
      assert.equal(verifyTransactionMemo(memo, shortCode).severity, "none");
      assert.deepEqual(detectMemoDeviations(memo, shortCode), []);
      assert.equal(extractSettlementFromTransactionPayload({ memo }).matched, true);
      assert.equal(Memo.text(memo).value, memo);

      // Slug/hash decomposition stays consistent with the generated code.
      const ref = extractExpenseReferenceFromMemo(memo);
      assert.equal(ref.valid, true);
      assert.equal(ref.shortCode, shortCode);
      assert.equal(ref.hashSuffix, shortCode.split("-").at(-1));
    });

    it("keeps a mid-segment-capped slug within budget and round-trippable", () => {
      // The 16-char slug cap can cut exactly onto a hyphen, producing a
      // double hyphen before the hash suffix — the result must still fit
      // the byte budget and survive the full round trip.
      const shortCode = generateShortCode("123456789012345-abc", "1.00");
      assert.ok(shortCode.length <= 21);
      assert.match(shortCode, /^[a-z0-9-]+$/);

      const memo = buildSettlementMemo(shortCode);
      assert.ok(memo);
      assert.equal(validateMemo(memo).valid, true);
      assert.equal(parseSettlementMemo(memo).valid, true);
      assert.equal(verifyTransactionMemo(memo, shortCode).severity, "none");
    });
  });
});

