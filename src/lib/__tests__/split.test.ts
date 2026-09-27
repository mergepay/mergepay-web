/**
 * Issue #25 — unit tests for src/lib/split.ts (Hamilton's largest-remainder
 * split + round-robin remainder + decimal-7 ↔ stroops helpers).
 *
 * Uses node:test (matches the working pattern in src/lib/__tests__/queries.test.ts)
 * because vitest refuse to load via CJS require when invoked through
 * `tsx --test`, which is the project's official test runner per package.json.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeSharesAmounts,
  roundRobinRemainder,
  toStroops,
  fromStroops,
  STROOPS_PER_UNIT,
  calculateSplit,
  evenSplitValues,
  formatBasisPoints,
  parseAmountStroops,
  parsePercentBasisPoints,
  trimAmount,
} from "../split";
import { describeSplitImbalance, splitCalculatorSchema } from "../validations/expense";

// ---------------------------------------------------------------------------
// computeSharesAmounts — Hamilton's largest-remainder method
// ---------------------------------------------------------------------------

describe("computeSharesAmounts", () => {
  it("equal split of 100 stroops across 3 members → [34, 33, 33] summing to 100", () => {
    // The canonical example from the issue body.
    assert.deepEqual(
      computeSharesAmounts(100n, [1, 1, 1]),
      [34n, 33n, 33n]
    );
  });

  it("equal split of 1000 stroops across 7 members sums to 1000", () => {
    const out = computeSharesAmounts(1000n, [1, 1, 1, 1, 1, 1, 1]);
    const total = out.reduce((s, x) => s + x, 0n);
    assert.equal(total, 1000n);
    // 1000 - 7*142 = 1000 - 994 = 6; ranks 0..5 get +1, rank 6 gets base.
    assert.deepEqual(out, [143n, 143n, 143n, 143n, 143n, 143n, 142n]);
  });

  it("single member receives the full total", () => {
    assert.deepEqual(computeSharesAmounts(100n, [1]), [100n]);
    assert.deepEqual(computeSharesAmounts(7n, [1]), [7n]);
  });

  it("zero total → all zeros, regardless of weights", () => {
    assert.deepEqual(computeSharesAmounts(0n, [1, 2, 3]), [0n, 0n, 0n]);
    assert.deepEqual(computeSharesAmounts(0n, []), []);
  });

  it("total = 1 stroop, 2 members equal → [1, 0]", () => {
    assert.deepEqual(computeSharesAmounts(1n, [1, 1]), [1n, 0n]);
  });

  it("total = 1 stroop, 3 members equal → [1, 0, 0] (first member gets the stroop)", () => {
    assert.deepEqual(computeSharesAmounts(1n, [1, 1, 1]), [1n, 0n, 0n]);
  });

  it("percentage split [25, 25, 50] of 100 → [25, 25, 50] (exact)", () => {
    assert.deepEqual(
      computeSharesAmounts(100n, [25, 25, 50]),
      [25n, 25n, 50n]
    );
  });

  it("percentage-ish split [33.33, 33.33, 33.34] of 100 → [33, 33, 34]", () => {
    // Per the issue's testing guidance:
    //   "create an expense with 3 members and 33.33% each; verify that
    //    amounts are 33, 33, 34 (if total=100)".
    assert.deepEqual(
      computeSharesAmounts(100n, [33.33, 33.33, 33.34]),
      [33n, 33n, 34n]
    );
  });

  it("weighted shares summing exactly to total → no remainder", () => {
    // 1.5 XLM = 15,000,000 stroops; weights summing to 1.5 with 3 parts of 0.5
    const total = 15_000_000n;
    const out = computeSharesAmounts(total, [0.5, 0.5, 0.5]);
    const sum = out.reduce((s, x) => s + x, 0n);
    assert.equal(sum, total);
    assert.deepEqual(out, [5_000_000n, 5_000_000n, 5_000_000n]);
  });

  it("many members with realistic Stellar totals always sum to total", () => {
    // 100 XLM split equally across 13 members; remainder of 100/13 in
    // stroops is 100e7 - 13 * floor(100e7/13) = members each get either
    // 76_923_076 stroops or 76_923_077 stroops, totalling 100e7.
    const total = 100n * STROOPS_PER_UNIT;
    const out = computeSharesAmounts(total, Array(13).fill(1));
    const sum = out.reduce((s, x) => s + x, 0n);
    assert.equal(sum, total);
    assert.equal(out.length, 13);
    for (const x of out) {
      assert.ok(x >= 76_923_076n);
      assert.ok(x <= 76_923_077n);
    }
  });

  it("empty weights → empty array (no allocation)", () => {
    assert.deepEqual(computeSharesAmounts(100n, []), []);
  });

  it("throws on negative weight", () => {
    assert.throws(
      () => computeSharesAmounts(100n, [1, -1]),
      /non-negative number/i
    );
  });

  it("throws on non-finite weight", () => {
    assert.throws(
      () => computeSharesAmounts(100n, [Number.POSITIVE_INFINITY, 1]),
      /non-negative number/i
    );
    assert.throws(
      () => computeSharesAmounts(100n, [Number.NaN, 1]),
      /non-negative number/i
    );
  });

  it("throws when weights sum to zero", () => {
    assert.throws(
      () => computeSharesAmounts(100n, [0, 0]),
      /positive number/i
    );
  });

  it("throws when total is negative", () => {
    assert.throws(() => computeSharesAmounts(-1n, [1]), /non-negative/);
  });

  it("preserves determinism: identical inputs yield identical outputs", () => {
    assert.deepEqual(
      computeSharesAmounts(100n, [1, 2, 3]),
      computeSharesAmounts(100n, [1, 2, 3])
    );
  });

  it("preserves exactness for very large totals (1B XLM)", () => {
    // 1B XLM = 1e16 stroops; exceeds Number.MAX_SAFE_INTEGER (≈9e15),
    // so this would silently lose precision if we used Number math.
    const big = 1_000_000_000n * STROOPS_PER_UNIT;
    const out = computeSharesAmounts(big, [1, 1, 1]);
    const sum = out.reduce((s, x) => s + x, 0n);
    assert.equal(sum, big);
    // 1e16 / 3 = 3333333333333333 with remainder 1; first index gets the +1.
    assert.equal(out[0], 3_333_333_333_333_334n);
    assert.equal(out[1], 3_333_333_333_333_333n);
    assert.equal(out[2], 3_333_333_333_333_333n);
  });
});

// ---------------------------------------------------------------------------
// roundRobinRemainder — simpler round-robin utility required by the issue
// ---------------------------------------------------------------------------

describe("roundRobinRemainder", () => {
  it("rem = 0 leaves the array unchanged", () => {
    const arr = [10, 20, 30];
    roundRobinRemainder(arr, 0);
    assert.deepEqual(arr, [10, 20, 30]);
  });

  it("empty array is left unchanged for any rem", () => {
    const arr: number[] = [];
    roundRobinRemainder(arr, 5);
    assert.deepEqual(arr, []);
  });

  it("distributes 1 unit to each slot when rem === length", () => {
    const arr = [0, 0, 0];
    roundRobinRemainder(arr, 3);
    assert.deepEqual(arr, [1, 1, 1]);
  });

  it("wraps around the array when rem exceeds length", () => {
    const a = [0, 0];
    roundRobinRemainder(a, 5);
    assert.deepEqual(a, [3, 2]);
    const b = [10, 20];
    roundRobinRemainder(b, 1);
    assert.deepEqual(b, [11, 20]);
  });

  it("mutates the array in place and returns void", () => {
    const arr = [0, 0, 0];
    const ret = roundRobinRemainder(arr, 2);
    assert.equal(ret, undefined);
    assert.deepEqual(arr, [1, 1, 0]);
  });

  it("throws on negative remainder", () => {
    assert.throws(
      () => roundRobinRemainder([0, 0], -1),
      /non-negative integer/
    );
  });

  it("throws on non-integer remainder", () => {
    assert.throws(
      () => roundRobinRemainder([0, 0], 1.5),
      /non-negative integer/
    );
  });
});

// ---------------------------------------------------------------------------
// toStroops / fromStroops — re-exported helpers (sanity-check the surface)
// ---------------------------------------------------------------------------

describe("toStroops", () => {
  it("converts 1 to 10,000,000 stroops", () => {
    assert.equal(toStroops("1"), 10_000_000n);
  });

  it("converts 0.0000001 to 1 stroop", () => {
    assert.equal(toStroops("0.0000001"), 1n);
  });

  it("converts 1.5 to 15,000,000 stroops", () => {
    assert.equal(toStroops("1.5"), 15_000_000n);
  });

  it("tolerates a trailing dot", () => {
    assert.equal(toStroops("50."), 500_000_000n);
  });

  it("parses a leading-dot fractional as 0.<frac> stroops", () => {
    assert.equal(toStroops(".5"), 5_000_000n);
  });

  it("throws on garbage", () => {
    assert.throws(() => toStroops("abc"));
  });
});

describe("fromStroops", () => {
  it("matches a 7-decimal API contract", () => {
    assert.equal(fromStroops(15_000_000n), "1.5000000");
    assert.equal(fromStroops(1n), "0.0000001");
    assert.equal(fromStroops(0n), "0.0000000");
  });

  it("round-trips with toStroops", () => {
    const samples = [100_000_000n, 1n, 99_999_999n, 12_345_678n];
    for (const s of samples) {
      assert.equal(toStroops(fromStroops(s)), s);
    }
  });

  it("renders negatives with a leading '-'", () => {
    assert.equal(fromStroops(-1n), "-0.0000001");
  });
});

// ---------------------------------------------------------------------------
// Split calculator (issue #353)
// ---------------------------------------------------------------------------

const sumStroops = (rows: { stroops: bigint | null }[]) =>
  rows.reduce((s, r) => s + (r.stroops ?? 0n), 0n);

describe("parseAmountStroops", () => {
  it("parses plain decimals up to 7 places", () => {
    assert.equal(parseAmountStroops("12.5"), 125_000_000n);
    assert.equal(parseAmountStroops(" 0.0000001 "), 1n);
  });

  it("rejects empty, signed, exponent and over-precise input", () => {
    for (const bad of ["", "  ", "-1", "1e3", "1.12345678", "abc", "1.", ".5"]) {
      assert.equal(parseAmountStroops(bad), null, bad);
    }
  });
});

describe("parsePercentBasisPoints / formatBasisPoints", () => {
  it("converts percentages to integer basis points", () => {
    assert.equal(parsePercentBasisPoints("33.33"), 3333);
    assert.equal(parsePercentBasisPoints("50"), 5000);
    assert.equal(parsePercentBasisPoints("0.5"), 50);
    assert.equal(parsePercentBasisPoints("100"), 10000);
  });

  it("rejects values above 100 or with more than 2 decimals", () => {
    assert.equal(parsePercentBasisPoints("100.01"), null);
    assert.equal(parsePercentBasisPoints("33.333"), null);
    assert.equal(parsePercentBasisPoints("-5"), null);
    assert.equal(parsePercentBasisPoints(""), null);
  });

  it("formats basis points without trailing zeros", () => {
    assert.equal(formatBasisPoints(3333), "33.33");
    assert.equal(formatBasisPoints(5000), "50");
    assert.equal(formatBasisPoints(50), "0.5");
    assert.equal(formatBasisPoints(-150), "-1.5");
  });
});

describe("calculateSplit — equal", () => {
  it("splits 10 XLM three ways and sums back to the stroop", () => {
    const calc = calculateSplit("equal", "10", [{ userId: "a" }, { userId: "b" }, { userId: "c" }]);
    assert.equal(calc.balance, "balanced");
    assert.deepEqual(
      calc.rows.map((r) => r.amount),
      ["3.3333334", "3.3333333", "3.3333333"]
    );
    assert.equal(sumStroops(calc.rows), toStroops("10"));
    assert.equal(calc.remainingStroops, 0n);
  });

  it("is invalid while the total is missing", () => {
    const calc = calculateSplit("equal", "", [{ userId: "a" }]);
    assert.equal(calc.balance, "invalid");
    assert.equal(calc.totalStroops, null);
  });

  it("is invalid with no participants", () => {
    assert.equal(calculateSplit("equal", "10", []).balance, "invalid");
  });
});

describe("calculateSplit — exact amounts", () => {
  it("balances when the amounts sum exactly to the total", () => {
    const calc = calculateSplit("custom", "100", [
      { userId: "a", amount: "33.33" },
      { userId: "b", amount: "33.33" },
      { userId: "c", amount: "33.34" },
    ]);
    assert.equal(calc.balance, "balanced");
    assert.equal(calc.allocatedStroops, toStroops("100"));
  });

  it("reports an under-allocation with the exact remaining amount", () => {
    const calc = calculateSplit("custom", "100", [
      { userId: "a", amount: "40" },
      { userId: "b", amount: "59.9999999" },
    ]);
    assert.equal(calc.balance, "under");
    assert.equal(calc.remainingStroops, 1n);
  });

  it("reports an over-allocation", () => {
    const calc = calculateSplit("custom", "10", [
      { userId: "a", amount: "6" },
      { userId: "b", amount: "5" },
    ]);
    assert.equal(calc.balance, "over");
    assert.equal(calc.remainingStroops, -toStroops("1"));
  });

  it("does not drift on amounts that are inexact as floats", () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754, but must balance here.
    const calc = calculateSplit("custom", "0.3", [
      { userId: "a", amount: "0.1" },
      { userId: "b", amount: "0.2" },
    ]);
    assert.equal(calc.balance, "balanced");
  });

  it("flags malformed rows as invalid", () => {
    const calc = calculateSplit("custom", "10", [
      { userId: "a", amount: "5" },
      { userId: "b", amount: "five" },
    ]);
    assert.equal(calc.balance, "invalid");
    assert.deepEqual(calc.invalidRows, [1]);
    assert.equal(calc.rows[1].amount, null);
  });
});

describe("calculateSplit — percentage", () => {
  it("allocates 33.33/33.33/33.34 of 100 exactly", () => {
    const calc = calculateSplit("percentage", "100", [
      { userId: "a", percent: "33.33" },
      { userId: "b", percent: "33.33" },
      { userId: "c", percent: "33.34" },
    ]);
    assert.equal(calc.balance, "balanced");
    assert.equal(calc.percentTotalBp, 10000);
    assert.deepEqual(
      calc.rows.map((r) => r.amount),
      ["33.3300000", "33.3300000", "33.3400000"]
    );
  });

  it("uses largest remainder so an awkward total still sums exactly", () => {
    const calc = calculateSplit("percentage", "0.0000010", [
      { userId: "a", percent: "33.33" },
      { userId: "b", percent: "33.33" },
      { userId: "c", percent: "33.34" },
    ]);
    assert.equal(calc.balance, "balanced");
    assert.equal(sumStroops(calc.rows), 10n);
  });

  it("reports percentages under 100%", () => {
    const calc = calculateSplit("percentage", "50", [
      { userId: "a", percent: "50" },
      { userId: "b", percent: "49.99" },
    ]);
    assert.equal(calc.balance, "under");
    assert.equal(calc.percentTotalBp, 9999);
  });

  it("reports percentages over 100%", () => {
    const calc = calculateSplit("percentage", "50", [
      { userId: "a", percent: "60" },
      { userId: "b", percent: "50" },
    ]);
    assert.equal(calc.balance, "over");
  });
});

describe("evenSplitValues", () => {
  it("pre-fills exact amounts that balance", () => {
    const rows = evenSplitValues("custom", "10", ["a", "b", "c"]);
    assert.deepEqual(rows.map((r) => r.amount), ["3.3333334", "3.3333333", "3.3333333"]);
    assert.equal(calculateSplit("custom", "10", rows).balance, "balanced");
  });

  it("pre-fills percentages that total exactly 100%", () => {
    const rows = evenSplitValues("percentage", "10", ["a", "b", "c"]);
    assert.deepEqual(rows.map((r) => r.percent), ["33.34", "33.33", "33.33"]);
    assert.equal(calculateSplit("percentage", "10", rows).balance, "balanced");
  });

  it("returns nothing for no participants", () => {
    assert.deepEqual(evenSplitValues("custom", "10", []), []);
  });
});

describe("trimAmount", () => {
  it("drops trailing fractional zeros", () => {
    assert.equal(trimAmount("12.5000000"), "12.5");
    assert.equal(trimAmount("12.0000000"), "12");
    assert.equal(trimAmount("12"), "12");
  });
});

describe("splitCalculatorSchema", () => {
  const base = {
    totalAmount: "100",
    allocations: [
      { userId: "a", amount: "", percent: "" },
      { userId: "b", amount: "", percent: "" },
    ],
  };

  it("accepts a balanced exact split", () => {
    const result = splitCalculatorSchema.safeParse({
      ...base,
      mode: "custom",
      allocations: [
        { userId: "a", amount: "60", percent: "" },
        { userId: "b", amount: "40", percent: "" },
      ],
    });
    assert.equal(result.success, true);
  });

  it("puts row format errors on the row path", () => {
    const result = splitCalculatorSchema.safeParse({
      ...base,
      mode: "custom",
      allocations: [
        { userId: "a", amount: "1,000", percent: "" },
        { userId: "b", amount: "40", percent: "" },
      ],
    });
    assert.equal(result.success, false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join("."));
    assert.ok(paths.includes("allocations.0.amount"));
  });

  it("rejects a percentage split that does not total 100%", () => {
    const result = splitCalculatorSchema.safeParse({
      ...base,
      mode: "percentage",
      allocations: [
        { userId: "a", amount: "", percent: "50" },
        { userId: "b", amount: "", percent: "40" },
      ],
    });
    assert.equal(result.success, false);
    const messages = result.success ? [] : result.error.issues.map((i) => i.message);
    assert.ok(messages.some((m) => m.includes("90%")));
  });

  it("requires the expense total before validating shares", () => {
    const result = splitCalculatorSchema.safeParse({ ...base, totalAmount: "", mode: "equal" });
    assert.equal(result.success, false);
  });
});

describe("describeSplitImbalance", () => {
  it("describes the amount left to assign", () => {
    const calc = calculateSplit("custom", "100", [
      { userId: "a", amount: "60" },
      { userId: "b", amount: "30" },
    ]);
    assert.equal(
      describeSplitImbalance(calc),
      "Amounts add up to 90 — 10 left to assign. They must total 100."
    );
  });

  it("returns null when balanced", () => {
    const calc = calculateSplit("equal", "100", [{ userId: "a" }]);
    assert.equal(describeSplitImbalance(calc), null);
  });
});
