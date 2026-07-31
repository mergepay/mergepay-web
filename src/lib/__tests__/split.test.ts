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
} from "../split";

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
