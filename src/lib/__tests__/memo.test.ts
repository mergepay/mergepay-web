import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateShortCode,
  validateMemo,
  validateShortCode,
  buildSettlementMemo,
  breakdownMemo,
  detectMemoDeviations,
  STELLAR_MEMO_MAX_BYTES,
  PREFIX_BYTES,
  MAX_SHORT_CODE_BYTES,
} from "../memoValidation";

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
});

