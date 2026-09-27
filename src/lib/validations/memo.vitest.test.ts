import { describe, expect, it } from "vitest";

import {
  MERGEPAY_MEMO_REGEX,
  STELLAR_MEMO_MAX_BYTES,
  buildMergepayMemo,
  isValidMergepayMemo,
  memoByteLength,
  mergepayMemoSchema,
  validateMergepayMemo,
} from "./memo";

describe("MERGEPAY_MEMO_REGEX", () => {
  it("matches the documented MP:<code> format", () => {
    expect(MERGEPAY_MEMO_REGEX.test("MP:dinner-1a2b")).toBe(true);
    expect(MERGEPAY_MEMO_REGEX.test("MP:a")).toBe(true);
    expect(MERGEPAY_MEMO_REGEX.test("MP:UPPER_case-99")).toBe(true);
  });

  it("requires a non-empty code", () => {
    expect(MERGEPAY_MEMO_REGEX.test("MP:")).toBe(false);
  });

  it("rejects anything outside [A-Za-z0-9_-]", () => {
    for (const bad of [
      "MP:dinner 1a2b",
      "MP:dinner/1a2b",
      "MP:dinner.1a2b",
      "MP:dinner:1a2b",
      "MP:dinner\n",
      "MP:mp:dinner",
    ]) {
      expect(MERGEPAY_MEMO_REGEX.test(bad)).toBe(false);
    }
  });

  it("rejects a missing or wrong prefix", () => {
    expect(MERGEPAY_MEMO_REGEX.test("dinner-1a2b")).toBe(false);
    expect(MERGEPAY_MEMO_REGEX.test("mp:dinner-1a2b")).toBe(false);
    expect(MERGEPAY_MEMO_REGEX.test(" XP:dinner")).toBe(false);
  });
});

describe("validateMergepayMemo", () => {
  it("accepts a well-formed memo and returns the short code", () => {
    const result = validateMergepayMemo("MP:dinner-1a2b");
    expect(result.valid).toBe(true);
    expect(result.shortCode).toBe("dinner-1a2b");
    expect(result.byteLength).toBe(14);
    expect(result.error).toBeUndefined();
  });

  it("treats an absent memo as valid (it is optional)", () => {
    for (const empty of [null, undefined, "", "   "]) {
      const result = validateMergepayMemo(empty);
      expect(result.valid).toBe(true);
      expect(result.byteLength).toBe(0);
    }
  });

  it("rejects an absent memo when required", () => {
    const result = validateMergepayMemo(undefined, { required: true });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  it("tolerates surrounding whitespace from a paste", () => {
    const result = validateMergepayMemo("  MP:dinner-1a2b\n");
    expect(result.valid).toBe(true);
    expect(result.shortCode).toBe("dinner-1a2b");
  });

  it("explains a missing prefix separately from bad characters", () => {
    expect(validateMergepayMemo("dinner-1a2b").error).toMatch(/start with "MP:"/);
    expect(validateMergepayMemo("MP:dinner 1a2b").error).toMatch(
      /letters, numbers, hyphens, and underscores/
    );
  });

  it("enforces the 28-byte Stellar limit", () => {
    const atLimit = `MP:${"a".repeat(25)}`;
    const overLimit = `MP:${"a".repeat(26)}`;

    expect(memoByteLength(atLimit)).toBe(STELLAR_MEMO_MAX_BYTES);
    expect(validateMergepayMemo(atLimit).valid).toBe(true);

    const result = validateMergepayMemo(overLimit);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/29 bytes/);
    expect(result.error).toMatch(/28/);
  });

  it("counts bytes, not characters, for multi-byte input", () => {
    // 13 two-byte chars is only 16 characters — under a character cap — but
    // 29 bytes once encoded, which is what the Stellar ledger counts.
    const wide = `MP:${"é".repeat(13)}`;
    expect(wide.length).toBeLessThan(28);
    expect(memoByteLength(wide)).toBe(29);
    expect(validateMergepayMemo(wide).error).toMatch(/29 bytes/);
  });

  it("always reports a byte length for a supplied memo", () => {
    expect(validateMergepayMemo("nope").byteLength).toBe(4);
  });
});

describe("isValidMergepayMemo", () => {
  it("mirrors validateMergepayMemo", () => {
    expect(isValidMergepayMemo("MP:dinner-1a2b")).toBe(true);
    expect(isValidMergepayMemo("dinner-1a2b")).toBe(false);
    expect(isValidMergepayMemo(null)).toBe(true);
  });
});

describe("buildMergepayMemo", () => {
  it("prefixes a bare reconciliation code", () => {
    expect(buildMergepayMemo("dinner-1a2b")).toBe("MP:dinner-1a2b");
  });

  it("returns null when the code cannot form a valid memo", () => {
    expect(buildMergepayMemo("dinner 1a2b")).toBeNull();
    expect(buildMergepayMemo("a".repeat(26))).toBeNull();
  });
});

describe("mergepayMemoSchema", () => {
  it("passes a valid memo through unchanged", () => {
    expect(mergepayMemoSchema.parse("MP:dinner-1a2b")).toBe("MP:dinner-1a2b");
  });

  it("trims and normalises an empty string to undefined", () => {
    expect(mergepayMemoSchema.parse("")).toBeUndefined();
    expect(mergepayMemoSchema.parse("   ")).toBeUndefined();
  });

  it("surfaces the same message the pure validator produces", () => {
    const result = mergepayMemoSchema.safeParse("dinner-1a2b");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      validateMergepayMemo("dinner-1a2b").error
    );
  });

  it("rejects a malformed memo", () => {
    expect(mergepayMemoSchema.safeParse("MP:").success).toBe(false);
    expect(mergepayMemoSchema.safeParse("MP:dinner 1a2b").success).toBe(false);
  });
});
