/**
 * Issue #359 — Automated End-to-End Expense Splitting Calculation Utility Tests.
 *
 * Verifies mathematical precision, remainder rounding, multi-currency conversions,
 * prime number splits, rounding dust distribution, and debt graph minimization.
 * Executed via node:test and tsx --test.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toStroops,
  fromStroops,
  computeSharesAmounts,
  roundRobinRemainder,
  splitEqual,
  splitByPercentage,
  splitByCustom,
} from "../split";
import { convertAmount, aggregateMixedAmounts, type ExchangeRates } from "../exchange";
import { simplifyDebts } from "../settlementUtils";
import type { MemberBalance } from "../types";

const makeMember = (userId: string, net: string, assetCode = "XLM"): MemberBalance => ({
  userId,
  user: {
    id: userId,
    stellarPublicKey: `G${userId.padEnd(55, "0")}`,
    displayName: userId,
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00Z",
  },
  net,
  assetCode,
});

describe("Expense Splitting — Equal Split Precision & Prime Splits (#359)", () => {
  it("handles zero total amount correctly across participants", () => {
    const participants = ["user_1", "user_2", "user_3"];
    const shares = splitEqual("0", participants);

    assert.equal(shares.length, 3);
    for (const share of shares) {
      assert.equal(share.amount, "0.0000000");
    }
    const totalStroops = shares.reduce((sum, s) => sum + toStroops(s.amount), 0n);
    assert.equal(totalStroops, 0n);
  });

  it("handles a single participant receiving 100% of expense", () => {
    const shares = splitEqual("42.5000000", ["alice"]);
    assert.equal(shares.length, 1);
    assert.equal(shares[0].amount, "42.5000000");
    assert.equal(toStroops(shares[0].amount), toStroops("42.5000000"));
  });

  it("splits accurately across 3 participants (prime split with remainder dust)", () => {
    // 10.0000000 XLM = 100,000,000 stroops.
    // 100,000,000 / 3 = 33,333,333 remainder 1.
    // First participant gets 33,333,334 stroops = 3.3333334 XLM.
    const shares = splitEqual("10.0000000", ["user_1", "user_2", "user_3"]);

    assert.equal(shares[0].amount, "3.3333334");
    assert.equal(shares[1].amount, "3.3333333");
    assert.equal(shares[2].amount, "3.3333333");

    const totalStroops = shares.reduce((acc, s) => acc + toStroops(s.amount), 0n);
    assert.equal(totalStroops, toStroops("10.0000000"));
  });

  it("splits accurately across 7 participants (prime split)", () => {
    const total = "100.0000000";
    const participants = Array.from({ length: 7 }, (_, i) => `member_${i + 1}`);
    const shares = splitEqual(total, participants);

    assert.equal(shares.length, 7);
    const sumStroops = shares.reduce((sum, s) => sum + toStroops(s.amount), 0n);
    assert.equal(sumStroops, toStroops(total));

    // Difference between max and min share must be at most 1 stroop (0.0000001)
    const stroopValues = shares.map((s) => toStroops(s.amount));
    const max = stroopValues.reduce((a, b) => (a > b ? a : b));
    const min = stroopValues.reduce((a, b) => (a < b ? a : b));
    assert.ok(max - min <= 1n);
  });

  it("splits accurately across 11 and 13 participants with exact stroop conservation", () => {
    for (const count of [11, 13]) {
      const total = "45.1234567";
      const participants = Array.from({ length: count }, (_, i) => `p_${i}`);
      const shares = splitEqual(total, participants);

      const sumStroops = shares.reduce((sum, s) => sum + toStroops(s.amount), 0n);
      assert.equal(sumStroops, toStroops(total), `Failed exact sum conservation for ${count} participants`);
    }
  });

  it("handles minimum indivisible amount (1 stroop) without fractional loss", () => {
    const shares = splitEqual("0.0000001", ["u1", "u2", "u3"]);
    assert.equal(shares[0].amount, "0.0000001");
    assert.equal(shares[1].amount, "0.0000000");
    assert.equal(shares[2].amount, "0.0000000");
    assert.equal(toStroops(shares[0].amount) + toStroops(shares[1].amount) + toStroops(shares[2].amount), 1n);
  });
});

describe("Expense Splitting — Percentage & Uneven Splits (#359)", () => {
  it("splits by exact percentages summing to 100%", () => {
    const allocations = [
      { userId: "alice", percent: 50 },
      { userId: "bob", percent: 30 },
      { userId: "carol", percent: 20 },
    ];
    const shares = splitByPercentage("100.0000000", allocations);

    assert.equal(shares[0].amount, "50.0000000");
    assert.equal(shares[1].amount, "30.0000000");
    assert.equal(shares[2].amount, "20.0000000");
    assert.equal(
      shares.reduce((s, x) => s + toStroops(x.amount), 0n),
      toStroops("100.0000000")
    );
  });

  it("distributes rounding dust with repeating decimal percentages (33.33% / 33.33% / 33.34%)", () => {
    const allocations = [
      { userId: "alice", percent: 33.33 },
      { userId: "bob", percent: 33.33 },
      { userId: "carol", percent: 33.34 },
    ];
    const total = "10.0000000";
    const shares = splitByPercentage(total, allocations);

    const sumStroops = shares.reduce((s, x) => s + toStroops(x.amount), 0n);
    assert.equal(sumStroops, toStroops(total));
    // Carol had the largest percentage (33.34%), so carol receives the larger fraction
    assert.ok(toStroops(shares[2].amount) >= toStroops(shares[0].amount));
  });

  it("handles custom amounts and preserves user inputs", () => {
    const custom = [
      { userId: "alice", amount: "12.3456789" },
      { userId: "bob", amount: "7.6543211" },
    ];
    const shares = splitByCustom("20.0000000", custom);

    assert.equal(shares[0].amount, "12.3456789");
    assert.equal(shares[1].amount, "7.6543211");
    assert.equal(toStroops(shares[0].amount) + toStroops(shares[1].amount), toStroops("20.0000000"));
  });

  it("roundRobinRemainder distributes units sequentially without mutation bugs", () => {
    const amounts = [10, 10, 10];
    roundRobinRemainder(amounts, 4);
    // 4 units distributed: +1 to index 0, +1 to index 1, +1 to index 2, +1 to index 0
    assert.deepEqual(amounts, [12, 11, 11]);
  });
});

describe("Expense Splitting — Multi-Currency Conversions (#359)", () => {
  const mockRates: ExchangeRates = {
    rates: {
      "XLM-USDC": 0.12,
      "USDC-XLM": 8.3333333,
      "EURC-USDC": 1.08,
      "USDC-EURC": 0.9259259,
    },
    live: true,
    timestamp: Date.now(),
  };

  it("converts same-currency amounts without loss of precision", () => {
    const converted = convertAmount("50.1234567", "XLM", "XLM", mockRates);
    assert.equal(converted, "50.1234567");
  });

  it("converts XLM to USDC using exchange rates and maintains 7 decimals", () => {
    // 100 XLM * 0.12 USDC/XLM = 12.0000000 USDC
    const converted = convertAmount("100.0000000", "XLM", "USDC", mockRates);
    assert.equal(converted, "12.0000000");
  });

  it("converts USDC to XLM using inverse rates", () => {
    // 12 USDC at inverse rate (0.12 USDC per XLM) = 100.0000000 XLM
    const converted = convertAmount("12.0000000", "USDC", "XLM", mockRates);
    assert.equal(converted, "100.0000000");
  });

  it("guards against underflow for non-zero minimal amounts", () => {
    // Converting 1 stroop of XLM to USDC should not round to 0
    const converted = convertAmount("0.0000001", "XLM", "USDC", mockRates);
    assert.notEqual(converted, null);
    assert.equal(converted, "0.0000001");
  });

  it("aggregates mixed asset expenses into a single base currency", () => {
    const items = [
      { amount: "100.0000000", assetCode: "XLM" }, // converts to 12.0000000 USDC
      { amount: "8.0000000", assetCode: "USDC" },   // 8.0000000 USDC
    ];
    const totalUSDC = aggregateMixedAmounts(items, "USDC", mockRates);
    assert.equal(totalUSDC, "20.0000000");
  });
});

describe("Expense Splitting — Debt Simplification & Graph Settlement Minimization (#359)", () => {
  it("simplifies a 3-way circular debt to 0 transactions (A owes B, B owes C, C owes A)", () => {
    // If everyone is square (net 0), no settlements are required.
    const balances = [
      makeMember("alice", "0"),
      makeMember("bob", "0.0000000"),
      makeMember("carol", "0.00"),
    ];
    const simplified = simplifyDebts(balances);
    assert.equal(simplified.length, 0);
  });

  it("minimizes debt chain: A owes B 10, B owes C 10 -> A owes C 10 directly", () => {
    // Net: A = -10, B = 0, C = +10
    const balances = [
      makeMember("alice", "-10.0000000"),
      makeMember("bob", "0.0000000"),
      makeMember("carol", "10.0000000"),
    ];
    const simplified = simplifyDebts(balances);
    assert.equal(simplified.length, 1);
    assert.equal(simplified[0].fromUserId, "alice");
    assert.equal(simplified[0].toUserId, "carol");
    assert.equal(simplified[0].amount, "10");
  });

  it("minimizes complex 5-member expense graph to smallest transaction set", () => {
    // Debts:
    // alice: +15
    // bob: +10
    // carol: -5
    // dave: -8
    // eve: -12
    // Sum credits = 25, Sum debts = -25.
    const balances = [
      makeMember("alice", "15.0000000"),
      makeMember("bob", "10.0000000"),
      makeMember("carol", "-5.0000000"),
      makeMember("dave", "-8.0000000"),
      makeMember("eve", "-12.0000000"),
    ];

    const simplified = simplifyDebts(balances);
    // 3 debtors, 2 creditors: greedy reduction pairs them in at most 4 transactions instead of all possible combinations
    assert.ok(simplified.length <= 4);

    const totalSettledStroops = simplified.reduce(
      (sum, path) => sum + toStroops(path.amount),
      0n
    );
    assert.equal(totalSettledStroops, 250_000_000n); // exactly 25 XLM in stroops
  });

  it("preserves asset isolation during multi-currency debt simplification", () => {
    // alice owes bob 5 USDC, while charlie owes dave 10 XLM.
    // They must NOT be merged or settled across currencies.
    const balances = [
      makeMember("bob", "5.0000000", "USDC"),
      makeMember("alice", "-5.0000000", "USDC"),
      makeMember("dave", "10.0000000", "XLM"),
      makeMember("charlie", "-10.0000000", "XLM"),
    ];

    const simplified = simplifyDebts(balances);
    assert.equal(simplified.length, 2);

    const usdcPath = simplified.find((p) => p.assetCode === "USDC");
    assert.ok(usdcPath);
    assert.equal(usdcPath?.fromUserId, "alice");
    assert.equal(usdcPath?.toUserId, "bob");
    assert.equal(usdcPath?.amount, "5");

    const xlmPath = simplified.find((p) => p.assetCode === "XLM");
    assert.ok(xlmPath);
    assert.equal(xlmPath?.fromUserId, "charlie");
    assert.equal(xlmPath?.toUserId, "dave");
    assert.equal(xlmPath?.amount, "10");
  });
});
