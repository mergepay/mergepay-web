/**
 * Issue #523 — unit tests for the split-distribution rules in src/lib/split.ts.
 *
 * The existing suites (`__tests__/split.test.ts`, `split.vitest.test.ts`)
 * already cover the headline Hamilton behaviour. This file pins the cases that
 * were still unasserted and that settlement correctness actually depends on:
 * the exact-sum invariant across participant counts, zero-weight members,
 * totals smaller than the participant count, the BigInt type guards, the
 * numeric (`type="number"`-sourced) branch of `toStroops`, and the
 * `basisPoints` values the split preview renders.
 *
 * Uses node:test because `npm test` runs these through `tsx --test`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateSplit,
  computeSharesAmounts,
  evenSplitValues,
  fromStroops,
  parseAmountStroops,
  splitByCustom,
  splitByPercentage,
  splitEqual,
  toStroops,
} from "../split";
import { toStroops as moneyToStroops } from "../money";

const sum = (values: bigint[]) => values.reduce((total, v) => total + v, 0n);

/** Highest minus lowest share, computed in BigInt space. */
function spread(shares: bigint[]): bigint {
  const sorted = [...shares].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[sorted.length - 1] - sorted[0];
}

describe("computeSharesAmounts — shares always sum to the total (#523)", () => {
  const participantCounts = [1, 2, 3, 5, 7, 13, 50, 100, 250];
  const totals = [1n, 2n, 7n, 999n, 10_000_000n, 12_345_678n, 1_000_000_000_000_000n];

  for (const count of participantCounts) {
    for (const total of totals) {
      it(`splits ${total} stroops ${count}-way exactly`, () => {
        const shares = computeSharesAmounts(total, new Array(count).fill(1));
        assert.equal(shares.length, count);
        assert.equal(sum(shares), total);
      });
    }
  }

  it("keeps every equal share within one stroop of each other", () => {
    for (const count of participantCounts) {
      for (const total of [999n, 10_000_000n, 12_345_678n]) {
        const shares = computeSharesAmounts(total, new Array(count).fill(1));
        assert.ok(
          spread(shares) <= 1n,
          `${total} across ${count} drifted by ${spread(shares)} stroops`
        );
      }
    }
  });

  it("gives the remainder to the lowest-index tied member, deterministically", () => {
    // 7 stroops three ways: everyone floors to 2, the leftover stroop goes to
    // index 0 because all fractional remainders tie.
    assert.deepEqual(computeSharesAmounts(7n, [1, 1, 1]), [3n, 2n, 2n]);
    assert.deepEqual(computeSharesAmounts(7n, [1, 1, 1]), computeSharesAmounts(7n, [1, 1, 1]));
  });

  it("scales unequal weights without inventing or losing stroops", () => {
    const total = 10_000_000n;
    const shares = computeSharesAmounts(total, [0.5, 0.25, 0.25]);
    assert.deepEqual(shares, [5_000_000n, 2_500_000n, 2_500_000n]);
    assert.equal(sum(shares), total);
  });
});

describe("computeSharesAmounts — totals smaller than the headcount", () => {
  it("pays one stroop each until the total runs out", () => {
    assert.deepEqual(computeSharesAmounts(2n, [1, 1, 1, 1, 1]), [1n, 1n, 0n, 0n, 0n]);
    assert.deepEqual(computeSharesAmounts(4n, [1, 1, 1, 1, 1, 1]), [1n, 1n, 1n, 1n, 0n, 0n]);
  });

  it("never under- or over-pays when the total is a single stroop", () => {
    assert.deepEqual(computeSharesAmounts(1n, [1, 1, 1]), [1n, 0n, 0n]);
    assert.equal(sum(computeSharesAmounts(1n, [1, 1, 1])), 1n);
  });
});

describe("computeSharesAmounts — zero-weight members", () => {
  it("allocates nothing to a member that opted out of the split", () => {
    assert.deepEqual(computeSharesAmounts(100n, [0, 1, 0]), [0n, 100n, 0n]);
  });

  it("sends the remainder around the zero-weight slot", () => {
    // 7 stroops between members 1 and 2 (member 0 is excluded): 3 each, and the
    // leftover goes to the lower of the two tied indices — not to member 0.
    assert.deepEqual(computeSharesAmounts(7n, [0, 1, 1]), [0n, 4n, 3n]);
  });

  it("keeps zero-weight members at zero in a weighted split", () => {
    const shares = computeSharesAmounts(3n, [2, 0, 1]);
    assert.deepEqual(shares, [2n, 0n, 1n]);
    assert.equal(sum(shares), 3n);
  });

  it("returns a zero for every member when the total is zero", () => {
    assert.deepEqual(computeSharesAmounts(0n, [1, 0, 2]), [0n, 0n, 0n]);
  });
});

describe("computeSharesAmounts — argument guards", () => {
  it("refuses a non-BigInt total instead of silently mis-splitting", () => {
    assert.throws(
      () => computeSharesAmounts(100 as unknown as bigint, [1, 1]),
      /total must be bigint/
    );
  });

  it("refuses a non-array weights argument", () => {
    assert.throws(
      () => computeSharesAmounts(100n, 3 as unknown as number[]),
      /weights must be array/
    );
  });

  it("rejects NaN and Infinity weights with the offending index", () => {
    assert.throws(() => computeSharesAmounts(100n, [1, Number.NaN]), /weight\[1\].*finite/i);
    assert.throws(
      () => computeSharesAmounts(100n, [1, Number.POSITIVE_INFINITY]),
      /weight\[1\].*finite/i
    );
  });

  it("rejects weights so small they scale to zero", () => {
    // Weights are scaled by 1e6 before the BigInt divide; sub-micro weights
    // collapse to 0, which would otherwise divide by a zero total.
    assert.throws(
      () => computeSharesAmounts(100n, [1e-9, 1e-9]),
      /weights must sum to a positive number/
    );
  });
});

describe("fromStroops — input guard", () => {
  it("refuses a Number where a BigInt is required", () => {
    assert.throws(() => fromStroops("5" as unknown as bigint), /bigint required/);
    assert.throws(() => fromStroops(5 as unknown as bigint), /bigint required/);
  });
});

describe("toStroops — numeric branch and over-precision", () => {
  it("accepts numbers as well as strings", () => {
    // `amount.toFixed(7)` is what makes the numeric form exact; this is the
    // path a value takes when it comes from a numeric source rather than the
    // wire-format string.
    assert.equal(toStroops(1.5), 15_000_000n);
    assert.equal(toStroops(0), 0n);
    assert.equal(toStroops(0.1), 1_000_000n);
    assert.equal(toStroops(1), 10_000_000n);
  });

  it("floors a Number below one stroop to zero rather than rounding up", () => {
    assert.equal(toStroops(1e-8), 0n);
  });

  it("truncates a string with more than 7 decimals, unlike money.toStroops", () => {
    // Documented divergence between the two `toStroops` helpers: split.ts
    // slices the fraction to 7 digits, money.ts rejects the input outright.
    assert.equal(toStroops("1.00000009"), 10_000_000n);
    assert.throws(() => moneyToStroops("1.00000009"), /Cannot convert/);
  });

  it("ignores everything after the second decimal point", () => {
    // "1.5.5" is garbage the UI blocks upstream; pin how it degrades so a
    // future change to the parser is a deliberate decision, not a surprise.
    assert.equal(toStroops("1.5.5"), 15_000_000n);
  });

  it("trims surrounding whitespace and throws on empty input", () => {
    assert.equal(toStroops(" 1.5 "), 15_000_000n);
    assert.throws(() => toStroops(""), /empty amount/);
    assert.throws(() => toStroops("   "), /empty amount/);
  });

  it("throws on a lone sign and on numeric separators", () => {
    assert.throws(() => toStroops("-"));
    assert.throws(() => toStroops("1_000"));
    assert.throws(() => toStroops(Number.NaN));
  });

  it("round-trips a full-precision amount", () => {
    assert.equal(fromStroops(toStroops("123.4567891")), "123.4567891");
  });
});

describe("parseAmountStroops — live parsing while typing", () => {
  it("accepts plain decimals up to 7 places", () => {
    assert.equal(parseAmountStroops("1.2345678"), 12_345_678n);
    assert.equal(parseAmountStroops("0.0000001"), 1n);
    assert.equal(parseAmountStroops(" 5 "), 50_000_000n);
  });

  it("treats an unfinished decimal as no value yet", () => {
    assert.equal(parseAmountStroops("10."), null);
    assert.equal(parseAmountStroops(".5"), null);
  });

  it("rejects a 9th decimal, signs and exponent notation", () => {
    assert.equal(parseAmountStroops("0.00000009"), null);
    assert.equal(parseAmountStroops("-5"), null);
    assert.equal(parseAmountStroops("1e2"), null);
  });

  it("accepts zero, which the split then refuses to divide", () => {
    assert.equal(parseAmountStroops("0"), 0n);
  });
});

describe("calculateSplit — basisPoints shown in the preview (#523)", () => {
  it("reports truncated basis points that need not total 10,000", () => {
    // 3-way split of 10 XLM is exact in stroops, but each row's percentage is
    // floored, so the rendered percentages sum to 99.99%. The amounts, not the
    // percentages, are what settles.
    const calc = calculateSplit("equal", "10", [{ userId: "a" }, { userId: "b" }, { userId: "c" }]);
    assert.deepEqual(
      calc.rows.map((row) => row.basisPoints),
      [3333, 3333, 3333]
    );
    assert.equal(calc.rows.reduce((total, row) => total + (row.basisPoints ?? 0), 0), 9999);
    assert.equal(calc.balance, "balanced");
    assert.equal(calc.remainingStroops, 0n);
    assert.deepEqual(
      calc.rows.map((row) => row.amount),
      ["3.3333334", "3.3333333", "3.3333333"]
    );
    assert.equal(sum(calc.rows.map((row) => row.stroops ?? 0n)), 100_000_000n);
  });

  it("reports null basis points for a row it cannot price", () => {
    const calc = calculateSplit("custom", "10", [
      { userId: "a", amount: "4" },
      { userId: "b", amount: "" },
    ]);
    assert.deepEqual(
      calc.rows.map((row) => [row.stroops, row.basisPoints]),
      [
        [40_000_000n, 4000],
        [null, null],
      ]
    );
    assert.deepEqual(calc.invalidRows, [1]);
    assert.equal(calc.balance, "invalid");
  });

  it("falls back to floored percentages when a percentage row is unparsable", () => {
    // The rows do add to 100% (the bad one contributes nothing), but because a
    // row is invalid the exact largest-remainder path is skipped and each
    // share is floored — so 50/50/invalid leaves the last stroop unassigned
    // rather than inventing one.
    const calc = calculateSplit("percentage", "0.0000003", [
      { userId: "a", percent: "50" },
      { userId: "b", percent: "50" },
      { userId: "c", percent: "abc" },
    ]);
    assert.equal(calc.percentTotalBp, 10_000);
    assert.deepEqual(
      calc.rows.map((row) => row.stroops),
      [1n, 1n, null]
    );
    assert.equal(calc.remainingStroops, 1n);
    assert.equal(calc.balance, "invalid");
  });

  it("marks an empty participant list invalid while still reporting the whole total as unallocated", () => {
    const calc = calculateSplit("equal", "10", []);
    assert.equal(calc.balance, "invalid");
    assert.equal(calc.remainingStroops, 100_000_000n);
    assert.deepEqual(calc.rows, []);
  });

  it("marks a zero total invalid instead of dividing nothing", () => {
    const calc = calculateSplit("equal", "0", [{ userId: "a" }, { userId: "b" }]);
    assert.equal(calc.balance, "invalid");
    assert.deepEqual(
      calc.rows.map((row) => row.stroops),
      [0n, 0n]
    );
  });
});

describe("splitEqual / splitByPercentage / splitByCustom", () => {
  it("return an empty allocation for no participants", () => {
    assert.deepEqual(splitEqual("10", []), []);
    assert.deepEqual(splitByPercentage("10", []), []);
  });

  it("carry every share to 7-decimal wire precision", () => {
    const shares = splitEqual("1", ["a", "b", "c"]);
    assert.deepEqual(
      shares.map((s) => s.amount),
      ["0.3333334", "0.3333333", "0.3333333"]
    );
    assert.equal(
      shares.reduce((total, s) => total + toStroops(s.amount), 0n),
      10_000_000n
    );
  });

  it("take custom rows verbatim and never reconcile them against the total", () => {
    // `splitByCustom` ignores `totalAmount` entirely — callers must run the
    // sum check themselves (the schema in validations/expense.ts does).
    const out = splitByCustom("10", [
      { userId: "a", amount: "1" },
      { userId: "b", amount: "2.5" },
    ]);
    assert.deepEqual(out, [
      { userId: "a", amount: "1.0000000" },
      { userId: "b", amount: "2.5000000" },
    ]);
    assert.notEqual(
      out.reduce((total, s) => total + toStroops(s.amount), 0n),
      toStroops("10")
    );
  });
});

describe("evenSplitValues — pre-filled starting points (#523)", () => {
  it("prefers the first member for the percentage remainder", () => {
    assert.deepEqual(evenSplitValues("percentage", "10", ["a", "b", "c"]), [
      { userId: "a", percent: "33.34" },
      { userId: "b", percent: "33.33" },
      { userId: "c", percent: "33.33" },
    ]);
  });

  it("only fills amounts in custom mode", () => {
    // The `amount` key is always present but `undefined` outside custom mode,
    // so callers spread it straight into the form without branching.
    assert.deepEqual(evenSplitValues("equal", "10", ["a", "b"]), [
      { userId: "a", amount: undefined },
      { userId: "b", amount: undefined },
    ]);
    assert.deepEqual(evenSplitValues("custom", "10", ["a", "b"]), [
      { userId: "a", amount: "5" },
      { userId: "b", amount: "5" },
    ]);
  });

  it("trims trailing zeros so the inputs stay readable", () => {
    const rows = evenSplitValues("custom", "10", ["a", "b", "c"]);
    assert.deepEqual(
      rows.map((row) => row.amount),
      ["3.3333334", "3.3333333", "3.3333333"]
    );
  });

  it("splits a sub-stroop-sized total without dropping stroops", () => {
    const rows = evenSplitValues("custom", "0.0000003", ["a", "b", "c"]);
    assert.deepEqual(
      rows.map((row) => row.amount),
      ["0.0000001", "0.0000001", "0.0000001"]
    );
    assert.equal(
      rows.reduce((total, row) => total + toStroops(row.amount ?? "0"), 0n),
      3n
    );
  });

  it("returns nothing when there is nobody to split with", () => {
    assert.deepEqual(evenSplitValues("custom", "10", []), []);
  });
});
