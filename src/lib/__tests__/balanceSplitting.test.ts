import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toStroops,
  fromStroops,
  computeSharesAmounts,
  splitEqual,
  splitByPercentage,
  splitByCustom,
  roundRobinRemainder,
} from "../split";

describe("Balance Calculation & Expense Splitting Suite (#287)", () => {
  it("converts decimal amounts to stroops without precision loss", () => {
    assert.equal(toStroops("1.5"), 15000000n);
    assert.equal(toStroops("0.0000001"), 1n);
    assert.equal(toStroops("42.5000000"), 425000000n);
    assert.equal(fromStroops(15000000n), "1.5000000");
    assert.equal(fromStroops(1n), "0.0000001");
  });

  it("handles rounding precision and distributes remainder deterministically (Hamilton's method)", () => {
    // 100 stroops split among 3 participants -> 34, 33, 33 (sums to 100)
    const shares = computeSharesAmounts(100n, [1, 1, 1]);
    assert.deepEqual(shares, [34n, 33n, 33n]);
    assert.equal(shares.reduce((a, b) => a + b, 0n), 100n);
  });

  it("splits equal expense among multiple participants with exact total sum", () => {
    const participants = ["user-1", "user-2", "user-3"];
    const result = splitEqual("10.00", participants);

    assert.equal(result.length, 3);
    const sum = result.reduce((acc, curr) => acc + toStroops(curr.amount), 0n);
    assert.equal(sum, toStroops("10.00"));
  });

  it("splits by percentage correctly ensuring 100% total allocation", () => {
    const allocations = [
      { userId: "u1", percent: 50 },
      { userId: "u2", percent: 30 },
      { userId: "u3", percent: 20 },
    ];
    const result = splitByPercentage("100.00", allocations);
    const sum = result.reduce((acc, curr) => acc + toStroops(curr.amount), 0n);
    assert.equal(sum, toStroops("100.00"));
  });

  it("splits by custom amounts verifying exact sum matching", () => {
    const customShares = [
      { userId: "u1", amount: "12.50" },
      { userId: "u2", amount: "7.50" },
    ];
    const result = splitByCustom("20.00", customShares);
    assert.equal(result.length, 2);
    assert.equal(result[0].amount, "12.5000000");
    assert.equal(result[1].amount, "7.5000000");
  });

  it("distributes leftover remainder units with roundRobinRemainder", () => {
    const baselines = [10, 10, 10];
    roundRobinRemainder(baselines, 2);
    assert.deepEqual(baselines, [11, 11, 10]);
    assert.equal(baselines.reduce((a, b) => a + b, 0), 32);
  });
});
