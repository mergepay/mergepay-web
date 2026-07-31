import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ASSET_DECIMALS,
  decimalsForAsset,
  validateExpenseAmount,
} from "../validation";

describe("decimalsForAsset", () => {
  it("defaults to Stellar's 7 decimals", () => {
    assert.equal(decimalsForAsset(), DEFAULT_ASSET_DECIMALS);
    assert.equal(decimalsForAsset("XLM"), 7);
    assert.equal(decimalsForAsset("USDC"), 7);
    assert.equal(decimalsForAsset(null), 7);
    assert.equal(decimalsForAsset(""), 7);
  });
});

describe("validateExpenseAmount — valid amounts", () => {
  const valid = [
    "1",
    "10",
    "0.5",
    "12.50",
    "150.00",
    "0.0000001", // one stroop
    "1.1234567", // exactly 7 decimals
    "922337203685.4775807", // int64 max stroops
  ];

  for (const amount of valid) {
    it(`accepts "${amount}"`, () => {
      const result = validateExpenseAmount(amount);
      assert.equal(result.valid, true, result.error);
      assert.equal(result.error, undefined);
    });
  }

  it("trims surrounding whitespace", () => {
    assert.deepEqual(validateExpenseAmount("  12.5  "), {
      valid: true,
      normalized: "12.5",
    });
  });

  it("drops a trailing decimal point when normalizing", () => {
    assert.equal(validateExpenseAmount("10.").normalized, "10");
  });

  it("preserves the caller's digits otherwise", () => {
    assert.equal(validateExpenseAmount("150.00").normalized, "150.00");
  });

  it("accepts a positive number and normalizes it to a plain string", () => {
    assert.deepEqual(validateExpenseAmount(12.5), {
      valid: true,
      normalized: "12.5",
    });
    assert.equal(validateExpenseAmount(100).normalized, "100");
  });

  it("accepts a positive bigint", () => {
    assert.equal(validateExpenseAmount(42n).normalized, "42");
  });

  it("keeps a sub-stroop number out of exponential notation", () => {
    // 1e-7 stringifies as "1e-7", which is not plain decimal notation.
    assert.equal(validateExpenseAmount(1e-7).normalized, "0.0000001");
  });
});

describe("validateExpenseAmount — invalid amounts", () => {
  const invalid: Array<[string, unknown]> = [
    ["zero", "0"],
    ["padded zero", "0.0000000"],
    ["numeric zero", 0],
    ["negative", "-1"],
    ["negative number", -1],
    ["negative decimal", "-0.5"],
    ["explicit plus sign", "+1"],
    ["empty string", ""],
    ["whitespace only", "   "],
    ["non-numeric text", "abc"],
    ["numeric-looking text", "12abc"],
    ["thousands separator", "1,000"],
    ["currency symbol", "$10"],
    ["exponential notation", "1e5"],
    ["hex", "0x10"],
    ["leading decimal point", ".5"],
    ["Infinity as a number", Number.POSITIVE_INFINITY],
    ["-Infinity as a number", Number.NEGATIVE_INFINITY],
    ["NaN as a number", Number.NaN],
    ["null", null],
    ["undefined", undefined],
    ["boolean", true],
    ["object", { amount: 1 }],
    ["array", ["1"]],
  ];

  for (const [label, amount] of invalid) {
    it(`rejects ${label}`, () => {
      const result = validateExpenseAmount(amount);
      assert.equal(result.valid, false);
      assert.equal(typeof result.error, "string");
      assert.ok((result.error as string).length > 0);
      assert.equal(result.normalized, undefined);
    });
  }

  it("rejects more decimal places than the asset allows", () => {
    const result = validateExpenseAmount("0.00000001"); // 8 dp
    assert.equal(result.valid, false);
    assert.match(result.error as string, /7 decimal places/);
  });

  it("rejects an amount above Stellar's int64 stroop range", () => {
    const result = validateExpenseAmount("922337203685.4775808");
    assert.equal(result.valid, false);
    assert.match(result.error as string, /maximum/i);
  });

  it("rejects an extremely large amount", () => {
    assert.equal(validateExpenseAmount("9".repeat(40)).valid, false);
    assert.equal(validateExpenseAmount(1e30).valid, false);
  });

  it("reports zero and negatives with distinct messages", () => {
    assert.match(
      validateExpenseAmount("0").error as string,
      /greater than zero/
    );
    assert.notEqual(
      validateExpenseAmount("0").error,
      validateExpenseAmount("-1").error
    );
  });
});

describe("validateExpenseAmount — asset precision", () => {
  it("uses 7 decimals for an unknown asset code", () => {
    assert.equal(validateExpenseAmount("1.1234567", "SOMEASSET").valid, true);
    assert.equal(validateExpenseAmount("1.12345678", "SOMEASSET").valid, false);
  });

  it("applies the same rules regardless of asset casing", () => {
    assert.equal(validateExpenseAmount("1.1234567", "xlm").valid, true);
    assert.equal(validateExpenseAmount("1.12345678", "xlm").valid, false);
  });
});
