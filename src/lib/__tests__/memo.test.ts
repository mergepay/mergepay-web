import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateShortCode,
  validateMemo,
  buildSettlementMemo,
  breakdownMemo,
  detectMemoDeviations,
  STELLAR_MEMO_MAX_BYTES,
  PREFIX_BYTES,
  MAX_SHORT_CODE_BYTES,
} from "../memoValidation";

describe("Stellar Memo Generation & Validation Suite (#287)", () => {
  it("enforces Stellar memo constants (max 28 bytes)", () => {
    assert.equal(STELLAR_MEMO_MAX_BYTES, 28);
    assert.equal(PREFIX_BYTES, 3); // "MP:" is 3 ASCII bytes
    assert.equal(MAX_SHORT_CODE_BYTES, 25);
  });

  it("generates deterministic short codes with MP: prefix constraints", () => {
    const code1 = generateShortCode("Dinner", "50.00");
    const code2 = generateShortCode("Dinner", "50.00");
    assert.equal(code1, code2);
    assert.match(code1, /^dinner-[0-9a-f]{4}$/);

    const fullMemo = buildSettlementMemo(code1);
    assert.match(fullMemo ?? "", /^MP:dinner-[0-9a-f]{4}$/);
    assert.ok(new TextEncoder().encode(fullMemo ?? "").length <= 28);
  });

  it("sanitizes special characters and limits length in short code", () => {
    const longTitle = "Party! @ John's House & Roof BBQ 2026";
    const code = generateShortCode(longTitle, "123.45");
    assert.ok(code.length <= 25);
    assert.doesNotMatch(code, /[^a-z0-9-]/);
  });

  it("validates Stellar text memo byte lengths and rejects control characters", () => {
    const valid = validateMemo("MP:dinner-8f3a");
    assert.equal(valid.valid, true);

    // Empty string is invalid (memo is required)
    assert.equal(validateMemo("").valid, false);

    // Over 28 bytes
    const tooLong = validateMemo("MP:this-is-a-very-long-memo-that-exceeds-twenty-eight-bytes");
    assert.equal(tooLong.valid, false);
    assert.match(tooLong.error ?? "", /exceeds/i);

    // Control characters (null byte)
    const nullByte = validateMemo("MP:\0test");
    assert.equal(nullByte.valid, false);
    assert.match(nullByte.error ?? "", /control characters/i);
  });

  it("inspects memo and identifies deviation from MP: convention", () => {
    const canonical = breakdownMemo("MP:dinner-8f3a");
    assert.equal(canonical.conformsToConvention, true);
    assert.equal(canonical.prefix, "MP:");
    assert.equal(canonical.shortCode, "dinner-8f3a");
    assert.equal(canonical.warnings.length, 0);

    const custom = breakdownMemo("custom-memo-without-prefix");
    assert.equal(custom.conformsToConvention, false);
    assert.equal(custom.shortCode, "custom-memo-without-prefix");

    const warnings = detectMemoDeviations("wrong-memo", "expected-1234");
    assert.ok(warnings.length > 0);
  });
});
