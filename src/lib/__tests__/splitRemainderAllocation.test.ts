import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allocateEqualRemainder,
  calculateSplit,
  evenSplitValues,
  fromStroops,
  splitEqual,
  toStroops,
} from "../split";

const sum = (values: bigint[]) => values.reduce((acc, value) => acc + value, 0n);

describe("equal split remainder allocation (#623)", () => {
  it("allocates a 10-unit amount across 3 participants in input order", () => {
    assert.deepEqual(allocateEqualRemainder(1000n, 3), [334n, 333n, 333n]);
    assert.deepEqual(allocateEqualRemainder(7n, 3), [3n, 2n, 2n]);
  });

  it("allocates each leftover unit to the first participants", () => {
    assert.deepEqual(allocateEqualRemainder(13n, 5), [3n, 3n, 3n, 2n, 2n]);
    assert.deepEqual(allocateEqualRemainder(2n, 5), [1n, 1n, 0n, 0n, 0n]);
    assert.deepEqual(allocateEqualRemainder(1n, 3), [1n, 0n, 0n]);
  });

  it("preserves totals for prime amounts and diverse group sizes", () => {
    for (const total of [0n, 1n, 2n, 7n, 11n, 97n, 10_000_000n, 100_000_000n, 9_007_199_254_740_993n]) {
      for (const count of [1, 2, 3, 5, 7, 11, 17, 97]) {
        const shares = allocateEqualRemainder(total, count);
        assert.equal(sum(shares), total);
        assert.equal(shares.length, count);
        assert.ok(shares.every((share, index) => index === 0 || shares[index - 1] >= share));
        assert.ok(shares[0] - shares[shares.length - 1] <= 1n);
      }
    }
  });

  it("preserves zero and rejects unsafe or unallocatable inputs", () => {
    assert.deepEqual(allocateEqualRemainder(0n, 0), []);
    assert.deepEqual(allocateEqualRemainder(0n, 3), [0n, 0n, 0n]);
    assert.throws(() => allocateEqualRemainder(1n, 0), /cannot allocate/);
    assert.throws(() => allocateEqualRemainder(-1n, 2), /non-negative bigint/);
    assert.throws(() => allocateEqualRemainder(1n, 2.5), /safe integer/);
    assert.throws(() => allocateEqualRemainder(1n, -1), /safe integer/);
  });

  it("integrates with share types and produces exact decimal-7 values", () => {
    const shares = splitEqual("10.00", ["a", "b", "c"]);
    assert.deepEqual(shares.map((s) => s.amount), ["3.3333334", "3.3333333", "3.3333333"]);
    assert.equal(sum(shares.map((s) => toStroops(s.amount))), toStroops("10.00"));
    const live = calculateSplit("equal", "0.0000013", ["a", "b", "c", "d", "e"].map((userId) => ({ userId })));
    assert.deepEqual(live.rows.map((r) => r.amount), ["0.0000003", "0.0000003", "0.0000003", "0.0000002", "0.0000002"]);
    assert.equal(live.remainingStroops, 0n);
    assert.equal(live.balance, "balanced");
    const initial = evenSplitValues("custom", "0.0000013", ["a", "b", "c", "d", "e"]);
    assert.equal(sum(initial.map((r) => toStroops(r.amount ?? "0"))), 13n);
    assert.equal(fromStroops(sum(live.rows.map((r) => r.stroops ?? 0n))), "0.0000013");
  });
});
