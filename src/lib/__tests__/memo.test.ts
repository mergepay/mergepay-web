import { describe, it } from "node:test";
import assert from "node:assert";
import {
  MEMO_MAX_BYTES,
  isValidSettlementMemo,
  normalizeMemo,
  parseMemo,
} from "../memo";

describe("normalizeMemo", () => {
  it("returns null for null, undefined, and empty input", () => {
    assert.strictEqual(normalizeMemo(null), null);
    assert.strictEqual(normalizeMemo(undefined), null);
    assert.strictEqual(normalizeMemo(""), null);
    assert.strictEqual(normalizeMemo("   "), null);
  });

  it("trims surrounding whitespace", () => {
    assert.strictEqual(normalizeMemo("  MP:AB12CD  "), "MP:AB12CD");
  });
});

describe("parseMemo", () => {
  it("accepts a well-formed MP: memo and exposes its code", () => {
    const parsed = parseMemo("MP:dinner-8f3a");
    assert.strictEqual(parsed?.status, "valid");
    assert.strictEqual(parsed?.code, "dinner-8f3a");
    assert.strictEqual(parsed?.issue, null);
  });

  it("accepts an uppercase code with no separators", () => {
    assert.strictEqual(parseMemo("MP:AB12CD")?.status, "valid");
  });

  it("accepts underscores and hyphens in the code", () => {
    assert.strictEqual(parseMemo("MP:trip_2026-a")?.status, "valid");
  });

  it("returns null when there is no memo to inspect", () => {
    assert.strictEqual(parseMemo(null), null);
    assert.strictEqual(parseMemo("   "), null);
  });

  it("flags a memo without the MP: prefix", () => {
    const parsed = parseMemo("dinner-8f3a");
    assert.strictEqual(parsed?.status, "malformed");
    assert.strictEqual(parsed?.issue, "wrong_prefix");
    assert.strictEqual(parsed?.code, null);
  });

  it("is case-sensitive about the prefix", () => {
    assert.strictEqual(parseMemo("mp:AB12CD")?.issue, "wrong_prefix");
  });

  it("flags an empty code after the prefix", () => {
    const parsed = parseMemo("MP:");
    assert.strictEqual(parsed?.status, "malformed");
    assert.strictEqual(parsed?.issue, "empty_code");
  });

  it("flags disallowed characters in the code", () => {
    const parsed = parseMemo("MP:has space");
    assert.strictEqual(parsed?.status, "malformed");
    assert.strictEqual(parsed?.issue, "invalid_characters");
  });

  it("flags a memo that exceeds the Stellar byte limit", () => {
    const parsed = parseMemo(`MP:${"a".repeat(MEMO_MAX_BYTES)}`);
    assert.strictEqual(parsed?.status, "malformed");
    assert.strictEqual(parsed?.issue, "too_long");
  });

  it("accepts a memo exactly at the byte limit", () => {
    // "MP:" is 3 bytes, so 25 code characters reach the 28-byte ceiling.
    const memo = `MP:${"a".repeat(MEMO_MAX_BYTES - 3)}`;
    assert.strictEqual(parseMemo(memo)?.status, "valid");
  });

  it("counts multi-byte characters against the limit", () => {
    // Each "é" is 2 bytes; 13 of them plus the 3-byte prefix exceeds 28.
    const parsed = parseMemo(`MP:${"é".repeat(13)}`);
    assert.strictEqual(parsed?.issue, "too_long");
  });

  it("always explains its verdict", () => {
    assert.ok(parseMemo("MP:ok")?.detail.length);
    assert.ok(parseMemo("nope")?.detail.length);
  });
});

describe("isValidSettlementMemo", () => {
  it("is true only for a conformant MP: memo", () => {
    assert.strictEqual(isValidSettlementMemo("MP:AB12CD"), true);
    assert.strictEqual(isValidSettlementMemo("MP:"), false);
    assert.strictEqual(isValidSettlementMemo("AB12CD"), false);
    assert.strictEqual(isValidSettlementMemo(null), false);
  });
});
