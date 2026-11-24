// Vitest suite for the balance / split arithmetic (issue #610).
//
// The extension is `.vitest.test.tsx` on purpose: `npm test` also runs
// `tsx --test src/lib/__tests__/*.test.ts` (node:test), and that glob would pick
// up a `*.vitest.test.ts` file and fail on the `vitest` import. The `.tsx`
// suffix keeps these out of the node runner, the same as the other Vitest
// suites in this folder.
//
// Everything here is pure: no network, no timers, no DOM.
import { describe, expect, it } from "vitest";

import {
  aggregateBalancesByAsset,
  calculatePortfolioExposure,
  calculateTotalNetPosition,
  getSortedAggregatedBalances,
} from "../balanceAggregation";
import {
  TREASURY_WITHDRAW_FEE_STROOPS,
  exceedsBalance,
  fromStroops as moneyFromStroops,
  normalizeAmount,
  parseAmount,
  parseExactAmount,
  parseExactDecimal,
  toStroops as moneyToStroops,
  validateAmount,
  withdrawalBalanceError,
} from "../money";
import { simplifyDebts } from "../settlementUtils";
import {
  FULL_PERCENT_BP,
  allocateEqualRemainder,
  calculateSplit,
  computeSharesAmounts,
  evenSplitValues,
  formatBasisPoints,
  fromStroops,
  parseAmountStroops,
  parsePercentBasisPoints,
  roundRobinRemainder,
  splitByCustom,
  splitByPercentage,
  splitEqual,
  toStroops,
  trimAmount,
} from "../split";
import { summarizeNetsByAsset } from "../totals";
import type { MemberBalance, User } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function user(id: string): User {
  return {
    id,
    stellarPublicKey: `G${id.toUpperCase()}`,
    displayName: id,
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function balance(userId: string, net: string, assetCode: string): MemberBalance {
  return { userId, user: user(userId), net, assetCode };
}

/** Sum of a bigint list. */
const sum = (values: bigint[]) => values.reduce((a, b) => a + b, BigInt(0));

// ---------------------------------------------------------------------------
// balanceAggregation.ts
// ---------------------------------------------------------------------------

describe("aggregateBalancesByAsset", () => {
  const rows = [
    balance("alice", "10", "XLM"),
    balance("alice", "-2.5", "XLM"),
    balance("alice", "5", "USDC"),
    balance("bob", "7", "XLM"),
  ];

  it("nets every row of an asset together across all members", () => {
    const result = aggregateBalancesByAsset(rows);

    expect(result.get("XLM")).toEqual({
      assetCode: "XLM",
      assetIssuer: null,
      netStroops: BigInt(145_000_000),
      net: "14.5000000",
      count: 3,
    });
    expect(result.get("USDC")?.netStroops).toBe(BigInt(50_000_000));
    expect(result.get("USDC")?.count).toBe(1);
  });

  it("limits the aggregate to one member when a userId is given", () => {
    const result = aggregateBalancesByAsset(rows, "alice");

    expect(result.get("XLM")?.netStroops).toBe(BigInt(75_000_000));
    expect(result.get("XLM")?.net).toBe("7.5000000");
    expect(result.get("XLM")?.count).toBe(2);
  });

  it("returns an empty map for an unknown member or no balances", () => {
    expect(aggregateBalancesByAsset(rows, "nobody").size).toBe(0);
    expect(aggregateBalancesByAsset([]).size).toBe(0);
  });

  it("keeps a zero balance as an entry instead of dropping the asset", () => {
    const result = aggregateBalancesByAsset([balance("alice", "0", "XLM")]);

    expect(result.get("XLM")?.netStroops).toBe(BigInt(0));
    expect(result.get("XLM")?.count).toBe(1);
  });

  it("keeps the sign of a negative debt", () => {
    const single = aggregateBalancesByAsset([balance("bob", "-3", "XLM")]);
    expect(single.get("XLM")?.netStroops).toBe(BigInt(-30_000_000));

    const two = aggregateBalancesByAsset([
      balance("bob", "-1", "XLM"),
      balance("bob", "-0.5", "XLM"),
    ]);
    expect(two.get("XLM")?.netStroops).toBe(BigInt(-15_000_000));
    expect(two.get("XLM")?.net).toBe("-1.5000000");
  });

  it("renders a net between -1 and 0 with a leading zero and its sign", () => {
    const result = aggregateBalancesByAsset([
      balance("a", "-0.5", "XLM"),
      balance("b", "0.4", "XLM"),
    ]);

    expect(result.get("XLM")?.netStroops).toBe(BigInt(-1_000_000));
    expect(result.get("XLM")?.net).toBe("-0.1000000");
  });

  it("skips rows whose amount cannot be read instead of counting them as zero", () => {
    const result = aggregateBalancesByAsset([
      balance("a", "abc", "XLM"),
      balance("a", "", "XLM"),
      balance("a", "4", "XLM"),
    ]);

    expect(result.get("XLM")?.count).toBe(1);
    expect(result.get("XLM")?.netStroops).toBe(BigInt(40_000_000));
    expect(aggregateBalancesByAsset([balance("a", "abc", "USDC")]).has("USDC")).toBe(false);
  });

  it("rounds an amount finer than a stroop half away from zero", () => {
    const up = aggregateBalancesByAsset([balance("a", "0.123456789", "XLM")]);
    expect(up.get("XLM")?.netStroops).toBe(BigInt(1_234_568));

    const down = aggregateBalancesByAsset([balance("a", "-0.123456789", "XLM")]);
    expect(down.get("XLM")?.netStroops).toBe(BigInt(-1_234_568));
  });

  it("does not drift when many small amounts are added", () => {
    const tenths = Array.from({ length: 10 }, () => balance("a", "0.1", "XLM"));

    expect(aggregateBalancesByAsset(tenths).get("XLM")?.netStroops).toBe(BigInt(10_000_000));
  });

  it("keeps each asset separate", () => {
    const result = aggregateBalancesByAsset([
      balance("a", "1", "XLM"),
      balance("a", "1", "USDC"),
    ]);

    expect([...result.keys()].sort()).toEqual(["USDC", "XLM"]);
  });
});

describe("getSortedAggregatedBalances", () => {
  it("orders the assets alphabetically by code", () => {
    const aggregation = aggregateBalancesByAsset([
      balance("a", "1", "XLM"),
      balance("a", "1", "USDC"),
      balance("a", "1", "AQUA"),
    ]);

    expect(getSortedAggregatedBalances(aggregation).map((b) => b.assetCode)).toEqual([
      "AQUA",
      "USDC",
      "XLM",
    ]);
  });

  it("returns an empty list for an empty aggregation", () => {
    expect(getSortedAggregatedBalances(new Map())).toEqual([]);
  });
});

describe("calculateTotalNetPosition", () => {
  it("adds the per-asset nets and returns the sorted breakdown", () => {
    const aggregation = aggregateBalancesByAsset([
      balance("a", "10", "XLM"),
      balance("a", "-4", "USDC"),
    ]);

    const { totalStroops, byAsset } = calculateTotalNetPosition(aggregation);

    expect(totalStroops).toBe(BigInt(60_000_000));
    expect(byAsset.map((b) => b.assetCode)).toEqual(["USDC", "XLM"]);
  });

  it("is zero for an empty aggregation", () => {
    expect(calculateTotalNetPosition(new Map())).toEqual({
      totalStroops: BigInt(0),
      byAsset: [],
    });
  });
});

describe("calculatePortfolioExposure", () => {
  it("computes total exposure with direct exchange rates", () => {
    const balances = [
      balance("alice", "10", "USDC"),
      balance("alice", "20", "XLM"),
    ];
    const rates = { "USDC-USD": 1.0, "XLM-USD": 0.1 };
    const result = calculatePortfolioExposure(balances, "USD", rates);

    expect(result.totalStroops).toBe(BigInt(12_000_0000));
    expect(result.breakdown).toHaveLength(2);
  });

  it("handles inverse exchange rates gracefully", () => {
    const balances = [
      balance("alice", "10", "XLM"),
    ];
    const rates = { "USD-XLM": 10 };
    const result = calculatePortfolioExposure(balances, "USD", rates);

    expect(result.totalStroops).toBe(BigInt(1_000_0000));
  });

  it("falls back to zero when exchange rates are missing", () => {
    const balances = [
      balance("alice", "10", "UNKNOWN"),
    ];
    const rates = { "XLM-USD": 0.1 };
    const result = calculatePortfolioExposure(balances, "USD", rates);

    expect(result.totalStroops).toBe(BigInt(0));
  });

  it("handles zero balances correctly", () => {
    const balances = [
      balance("alice", "0", "XLM"),
      balance("alice", "0", "USDC"),
    ];
    const rates = { "XLM-USD": 0.1 };
    const result = calculatePortfolioExposure(balances, "USD", rates);

    expect(result.totalStroops).toBe(BigInt(0));
  });

  it("accepts nested rates object format", () => {
    const balances = [
      balance("alice", "10", "XLM"),
    ];
    const rates = { rates: { "XLM-USD": 0.5 } };
    const result = calculatePortfolioExposure(balances, "USD", rates);

    expect(result.totalStroops).toBe(BigInt(50_000_000));
  });
});

// ---------------------------------------------------------------------------
// totals.ts
// ---------------------------------------------------------------------------

describe("summarizeNetsByAsset", () => {
  it("splits each asset into what is owed, what is owing and the signed net", () => {
    const result = summarizeNetsByAsset([
      { yourNet: "10", netAssetCode: "usdc" },
      { yourNet: "-4.5", netAssetCode: "USDC" },
      { yourNet: "-20", netAssetCode: "XLM" },
    ]);

    expect(result).toEqual([
      { assetCode: "XLM", owed: "0", owe: "20", net: "-20" },
      { assetCode: "USDC", owed: "10", owe: "4.5", net: "5.5" },
    ]);
  });

  it("leads with the asset the user has the most at stake in", () => {
    const result = summarizeNetsByAsset([
      { yourNet: "1", netAssetCode: "AAA" },
      { yourNet: "-50", netAssetCode: "BBB" },
      { yourNet: "10", netAssetCode: "CCC" },
    ]);

    expect(result.map((r) => r.assetCode)).toEqual(["BBB", "CCC", "AAA"]);
  });

  it("breaks a tie in gross exposure alphabetically", () => {
    const result = summarizeNetsByAsset([
      { yourNet: "-5", netAssetCode: "ZED" },
      { yourNet: "5", netAssetCode: "ABC" },
    ]);

    expect(result.map((r) => r.assetCode)).toEqual(["ABC", "ZED"]);
  });

  it("skips entries with an unreadable amount or no asset code", () => {
    const result = summarizeNetsByAsset([
      { yourNet: "abc", netAssetCode: "XLM" },
      { yourNet: "5", netAssetCode: "" },
      { yourNet: "5", netAssetCode: "   " },
      { yourNet: "5", netAssetCode: undefined as unknown as string },
      { yourNet: "3", netAssetCode: "XLM" },
    ]);

    expect(result).toEqual([{ assetCode: "XLM", owed: "3", owe: "0", net: "3" }]);
  });

  it("lists an asset whose only balance is zero with all-zero totals", () => {
    expect(summarizeNetsByAsset([{ yourNet: "0", netAssetCode: "XLM" }])).toEqual([
      { assetCode: "XLM", owed: "0", owe: "0", net: "0" },
    ]);
  });

  it("is empty for no balances", () => {
    expect(summarizeNetsByAsset([])).toEqual([]);
  });

  it("rounds an amount finer than a stroop up to one stroop", () => {
    const [row] = summarizeNetsByAsset([{ yourNet: "0.00000005", netAssetCode: "XLM" }]);

    expect(row?.owed).toBe("0.0000001");
  });

  it("sums without floating point drift", () => {
    const tenths = Array.from({ length: 10 }, () => ({ yourNet: "0.1", netAssetCode: "XLM" }));

    expect(summarizeNetsByAsset(tenths)[0]).toEqual({
      assetCode: "XLM",
      owed: "1",
      owe: "0",
      net: "1",
    });
  });

  it("nets positive and negative entries of one asset to a signed figure", () => {
    const [row] = summarizeNetsByAsset([
      { yourNet: "2.25", netAssetCode: "XLM" },
      { yourNet: "-10.125", netAssetCode: "XLM" },
    ]);

    expect(row).toEqual({ assetCode: "XLM", owed: "2.25", owe: "10.125", net: "-7.875" });
  });
});

// ---------------------------------------------------------------------------
// settlementUtils.ts
// ---------------------------------------------------------------------------

describe("simplifyDebts", () => {
  it("pays every debtor straight to the single creditor", () => {
    const paths = simplifyDebts([
      balance("alice", "30", "XLM"),
      balance("bob", "-10", "XLM"),
      balance("carol", "-20", "XLM"),
    ]);

    expect(paths.map((p) => [p.fromUserId, p.toUserId, p.amount, p.assetCode])).toEqual([
      ["bob", "alice", "10", "XLM"],
      ["carol", "alice", "20", "XLM"],
    ]);
  });

  it("splits one debtor across several creditors in order", () => {
    const paths = simplifyDebts([
      balance("alice", "5", "XLM"),
      balance("bob", "5", "XLM"),
      balance("carol", "-10", "XLM"),
    ]);

    expect(paths.map((p) => [p.fromUserId, p.toUserId, p.amount])).toEqual([
      ["carol", "alice", "5"],
      ["carol", "bob", "5"],
    ]);
  });

  it("carries the user objects of both sides", () => {
    const [path] = simplifyDebts([balance("alice", "1", "XLM"), balance("bob", "-1", "XLM")]);

    expect(path?.from).toEqual(user("bob"));
    expect(path?.to).toEqual(user("alice"));
  });

  it("never offsets one asset against another", () => {
    const paths = simplifyDebts([
      balance("alice", "10", "XLM"),
      balance("bob", "-10", "USDC"),
    ]);

    expect(paths).toEqual([]);
  });

  it("simplifies each asset on its own", () => {
    const paths = simplifyDebts([
      balance("alice", "10", "XLM"),
      balance("bob", "-10", "XLM"),
      balance("alice", "-4", "USDC"),
      balance("bob", "4", "USDC"),
    ]);

    expect(paths.map((p) => [p.fromUserId, p.toUserId, p.amount, p.assetCode])).toEqual([
      ["bob", "alice", "10", "XLM"],
      ["alice", "bob", "4", "USDC"],
    ]);
  });

  it("ignores members who are settled up", () => {
    const paths = simplifyDebts([
      balance("alice", "0", "XLM"),
      balance("bob", "0.0000000", "XLM"),
    ]);

    expect(paths).toEqual([]);
  });

  it("keeps fractional amounts exact", () => {
    const paths = simplifyDebts([
      balance("alice", "0.3", "XLM"),
      balance("bob", "-0.1", "XLM"),
      balance("carol", "-0.2", "XLM"),
    ]);

    expect(paths.map((p) => p.amount)).toEqual(["0.1", "0.2"]);
  });

  it("keeps a one-stroop debt exact and prints the shortest amount", () => {
    const paths = simplifyDebts([
      balance("alice", "0.0000001", "XLM"),
      balance("bob", "-0.0000001", "XLM"),
    ]);

    expect(paths.map((p) => p.amount)).toEqual(["0.0000001"]);
  });

  it("stops at the smaller side when the nets do not sum to zero", () => {
    const paths = simplifyDebts([balance("alice", "10", "XLM"), balance("bob", "-4", "XLM")]);

    expect(paths.map((p) => p.amount)).toEqual(["4"]);
  });

  it("is empty for no members", () => {
    expect(simplifyDebts([])).toEqual([]);
  });

  it("moves exactly the total owed, whatever the mix of balances", () => {
    const members = [
      balance("a", "12.5", "XLM"),
      balance("b", "7.25", "XLM"),
      balance("c", "-9.75", "XLM"),
      balance("d", "-10", "XLM"),
    ];

    const total = simplifyDebts(members).reduce(
      (acc, p) => acc + toStroops(p.amount),
      BigInt(0),
    );

    expect(total).toBe(toStroops("19.75"));
  });
});

// ---------------------------------------------------------------------------
// money.ts (the parts the existing suites do not reach)
// ---------------------------------------------------------------------------

describe("parseExactDecimal", () => {
  it("scales a plain decimal to an exact integer", () => {
    expect(parseExactDecimal("1.5", 7)).toEqual({
      ok: true,
      value: { scaled: BigInt(15_000_000), plain: "1.5", negative: false },
    });
  });

  it("reads exponential notation in both directions", () => {
    expect(parseExactDecimal("1e-7", 7)).toMatchObject({
      ok: true,
      value: { scaled: BigInt(1), plain: "0.0000001" },
    });
    expect(parseExactDecimal("1.5e2", 7)).toMatchObject({
      ok: true,
      value: { scaled: BigInt(1_500_000_000), plain: "150" },
    });
  });

  it("accepts a leading dot and a trailing dot", () => {
    expect(parseExactDecimal(".5", 7)).toMatchObject({ ok: true, value: { plain: "0.5" } });
    expect(parseExactDecimal("5.", 7)).toMatchObject({ ok: true, value: { plain: "5" } });
  });

  it("keeps the sign of a negative value but never reports negative zero", () => {
    expect(parseExactDecimal("-2.5", 7)).toMatchObject({
      ok: true,
      value: { scaled: BigInt(-25_000_000), plain: "-2.5", negative: true },
    });
    expect(parseExactDecimal("-0", 7)).toMatchObject({
      ok: true,
      value: { scaled: BigInt(0), plain: "0", negative: false },
    });
  });

  it("rejects more fractional digits than the scale holds instead of rounding", () => {
    expect(parseExactDecimal("1.12345678", 7)).toEqual({ ok: false, error: "too_precise" });
    expect(parseExactDecimal("1.005", 2)).toEqual({ ok: false, error: "too_precise" });
  });

  it("only counts significant digits against the scale", () => {
    expect(parseExactDecimal("1.1234567800", 7)).toEqual({ ok: false, error: "too_precise" });
    expect(parseExactDecimal("1.5000000000", 7)).toMatchObject({
      ok: true,
      value: { plain: "1.5" },
    });
  });

  it("reports empty and malformed input", () => {
    expect(parseExactDecimal("", 7)).toEqual({ ok: false, error: "empty" });
    expect(parseExactDecimal("   ", 7)).toEqual({ ok: false, error: "empty" });
    for (const bad of ["abc", "1,5", "1e", "--1", "1.2.3"]) {
      expect(parseExactDecimal(bad, 7)).toEqual({ ok: false, error: "not_a_number" });
    }
  });

  it("parseExactAmount uses the 7 decimal places of a stroop", () => {
    expect(parseExactAmount("0.0000001")).toMatchObject({ ok: true });
    expect(parseExactAmount("0.00000001")).toEqual({ ok: false, error: "too_precise" });
  });
});

describe("amount validators", () => {
  it("parseAmount returns the plain decimal of a positive amount", () => {
    expect(parseAmount("1.5")).toBe("1.5");
    expect(parseAmount("1e-7")).toBe("0.0000001");
    expect(parseAmount(" 2.50 ")).toBe("2.5");
  });

  it("parseAmount rejects zero, negatives, junk and sub-stroop precision", () => {
    for (const bad of ["0", "-1", "abc", "", "0.00000001"]) expect(parseAmount(bad)).toBeNull();
  });

  it("validateAmount says nothing for a valid amount", () => {
    expect(validateAmount("0.0000001")).toBeNull();
    expect(validateAmount("1000000")).toBeNull();
  });

  it("validateAmount explains why an amount is not valid", () => {
    for (const bad of ["", "abc", "0", "-1"]) {
      expect(validateAmount(bad)).toBe("Enter a valid positive amount.");
    }
    expect(validateAmount("1.12345678")).toBe("Amount cannot exceed 7 decimal places (1 stroop).");
  });

  it("normalizeAmount returns the plain decimal and throws with the offending input otherwise", () => {
    expect(normalizeAmount("1e-7")).toBe("0.0000001");
    expect(normalizeAmount("007.50")).toBe("7.5");
    expect(() => normalizeAmount("abc")).toThrow('Invalid amount: "abc"');
    expect(() => normalizeAmount("0")).toThrow('Invalid amount: "0"');
    expect(() => normalizeAmount("1.12345678")).toThrow('Amount "1.12345678" exceeds 7 decimal places.');
  });

  it("money.toStroops is exact and refuses anything that is not a positive amount", () => {
    expect(moneyToStroops("1.5")).toBe(BigInt(15_000_000));
    expect(moneyToStroops("0.0000001")).toBe(BigInt(1));
    for (const bad of ["0", "-1", "abc", ""]) {
      expect(() => moneyToStroops(bad)).toThrow(`Cannot convert "${bad}" to stroops.`);
    }
  });
});

describe("money.fromStroops", () => {
  it("writes the shortest exact decimal", () => {
    expect(moneyFromStroops(BigInt(15_000_000))).toBe("1.5");
    expect(moneyFromStroops(BigInt(100))).toBe("0.00001");
    expect(moneyFromStroops(BigInt(1))).toBe("0.0000001");
    expect(moneyFromStroops(BigInt(0))).toBe("0");
  });

  it("keeps the sign and handles values past the safe-integer range", () => {
    expect(moneyFromStroops(BigInt(-15_000_000))).toBe("-1.5");
    expect(moneyFromStroops(BigInt("12345678901234567"))).toBe("1234567890.1234567");
  });
});

describe("exceedsBalance", () => {
  it("compares to the stroop", () => {
    expect(exceedsBalance("10", "10")).toBe(false);
    expect(exceedsBalance("10.0000001", "10")).toBe(true);
    expect(exceedsBalance("9.9999999", "10")).toBe(false);
  });

  it("treats unreadable input as exceeding the balance", () => {
    expect(exceedsBalance("abc", "10")).toBe(true);
    expect(exceedsBalance("1", "")).toBe(true);
    expect(exceedsBalance("0", "10")).toBe(true);
  });
});

describe("withdrawalBalanceError", () => {
  it("makes no judgement while the balance is still loading", () => {
    expect(withdrawalBalanceError({ amountRaw: "5", balanceRaw: undefined, assetCode: "XLM" })).toBeNull();
  });

  it("leaves amount-shape errors to the amount validator", () => {
    for (const amountRaw of ["", "abc", "0", "-1", "1.00000001"]) {
      expect(withdrawalBalanceError({ amountRaw, balanceRaw: "10", assetCode: "XLM" })).toBeNull();
    }
  });

  it("makes no judgement on an unreadable balance", () => {
    expect(withdrawalBalanceError({ amountRaw: "1", balanceRaw: "n/a", assetCode: "USDC" })).toBeNull();
  });

  it("flags an amount above the balance, naming the available figure", () => {
    expect(withdrawalBalanceError({ amountRaw: "6", balanceRaw: "5", assetCode: "USDC" })).toBe(
      "Insufficient balance. Available: 5 USDC.",
    );
  });

  it("flags an XLM withdrawal that leaves nothing for the fee, with the exact shortfall", () => {
    expect(withdrawalBalanceError({ amountRaw: "10", balanceRaw: "10", assetCode: "XLM" })).toBe(
      "Insufficient balance (need 0.00001 XLM more for fee).",
    );
  });

  it("accepts an XLM withdrawal that still covers the fee", () => {
    expect(withdrawalBalanceError({ amountRaw: "9.9999", balanceRaw: "10", assetCode: "XLM" })).toBeNull();
  });

  it("uses a custom fee for the XLM shortfall", () => {
    expect(
      withdrawalBalanceError({
        amountRaw: "10",
        balanceRaw: "10",
        assetCode: "XLM",
        feeStroops: BigInt(200),
      }),
    ).toBe("Insufficient balance (need 0.00002 XLM more for fee).");
  });

  it("checks the XLM balance for the fee on a non-XLM withdrawal", () => {
    const base = { amountRaw: "1", balanceRaw: "5", assetCode: "USDC" };

    expect(withdrawalBalanceError({ ...base, nativeBalanceRaw: "0" })).toBe(
      "Insufficient XLM for the network fee (need about 0.00001 XLM).",
    );
    expect(withdrawalBalanceError({ ...base, nativeBalanceRaw: "1" })).toBeNull();
    expect(withdrawalBalanceError({ ...base, nativeBalanceRaw: undefined })).toBeNull();
    expect(withdrawalBalanceError({ ...base, nativeBalanceRaw: "n/a" })).toBeNull();
  });

  it("defaults the fee to one base-fee operation", () => {
    expect(TREASURY_WITHDRAW_FEE_STROOPS).toBe(BigInt(100));
  });
});

// ---------------------------------------------------------------------------
// split.ts
// ---------------------------------------------------------------------------

describe("split.toStroops / split.fromStroops", () => {
  it("converts a decimal string and a number to integer stroops", () => {
    expect(toStroops("1.5")).toBe(BigInt(15_000_000));
    expect(toStroops(1.5)).toBe(BigInt(15_000_000));
    expect(toStroops("0.0000001")).toBe(BigInt(1));
    expect(toStroops("0")).toBe(BigInt(0));
  });

  it("tolerates a trailing dot, a leading dot and surrounding spaces", () => {
    expect(toStroops("50.")).toBe(BigInt(500_000_000));
    expect(toStroops(".5")).toBe(BigInt(5_000_000));
    expect(toStroops("  2.5 ")).toBe(BigInt(25_000_000));
  });

  it("truncates digits beyond the seventh instead of rounding", () => {
    expect(toStroops("0.123456789")).toBe(BigInt(1_234_567));
  });

  it("throws on empty and non-numeric input", () => {
    expect(() => toStroops("")).toThrow(/empty amount/);
    expect(() => toStroops("   ")).toThrow(/empty amount/);
    expect(() => toStroops("abc")).toThrow();
  });

  it("writes seven decimals and keeps the sign", () => {
    expect(fromStroops(BigInt(15_000_000))).toBe("1.5000000");
    expect(fromStroops(BigInt(0))).toBe("0.0000000");
    expect(fromStroops(BigInt(-5))).toBe("-0.0000005");
    expect(fromStroops(BigInt("12345678901234567"))).toBe("1234567890.1234567");
  });

  it("rejects a value that is not a bigint", () => {
    expect(() => fromStroops(5 as unknown as bigint)).toThrow(/bigint required/);
  });

  it("round-trips a positive amount", () => {
    for (const amount of ["0.0000001", "1.2345678", "999999.9999999", "10"]) {
      expect(toStroops(fromStroops(toStroops(amount)))).toBe(toStroops(amount));
    }
  });

  // Known defect, documented rather than hidden: the integer part is parsed with
  // its sign but the fraction is always added, so a negative amount with a
  // fractional part loses magnitude ("-1.5" reads as -0.5) and a negative
  // amount below one unit flips positive ("-0.5" reads as +0.5). `it.fails`
  // keeps the suite green while the bug exists and turns red the moment it is
  // fixed, which is the cue to change these to plain `it`.
  it.fails("reads a negative amount with a fractional part exactly (known bug)", () => {
    expect(fromStroops(toStroops("-1.5"))).toBe("-1.5000000");
  });

  it.fails("keeps the sign of a negative amount below one unit (known bug)", () => {
    expect(fromStroops(toStroops("-0.5"))).toBe("-0.5000000");
  });

  it("reads a negative whole-number amount correctly", () => {
    expect(fromStroops(toStroops("-2"))).toBe("-2.0000000");
  });
});

describe("computeSharesAmounts", () => {
  it("gives the extra unit to the earlier share when the remainders tie", () => {
    expect(computeSharesAmounts(BigInt(100), [1, 1, 1])).toEqual([BigInt(34), BigInt(33), BigInt(33)]);
    expect(computeSharesAmounts(BigInt(1), [1, 1])).toEqual([BigInt(1), BigInt(0)]);
  });

  it("gives the leftover unit to the largest fractional remainder", () => {
    expect(computeSharesAmounts(BigInt(10), [1, 2])).toEqual([BigInt(3), BigInt(7)]);
    expect(computeSharesAmounts(BigInt(100), [33.33, 33.33, 33.34])).toEqual([
      BigInt(33),
      BigInt(33),
      BigInt(34),
    ]);
  });

  it("gives a zero weight nothing", () => {
    expect(computeSharesAmounts(BigInt(10), [0, 1, 1])).toEqual([BigInt(0), BigInt(5), BigInt(5)]);
  });

  it("returns zeros for a zero total and an empty list for no weights", () => {
    expect(computeSharesAmounts(BigInt(0), [1, 2])).toEqual([BigInt(0), BigInt(0)]);
    expect(computeSharesAmounts(BigInt(50), [])).toEqual([]);
  });

  it("always sums exactly to the total", () => {
    const cases: Array<[bigint, number[]]> = [
      [BigInt(1), [1, 1, 1]],
      [BigInt(7), [1, 1, 1, 1]],
      [BigInt(100), [33.33, 33.33, 33.34]],
      [BigInt("99999999999999999"), [3, 5, 11, 0.5]],
      [BigInt(10_000_000), [1, 2, 3, 4, 5, 6, 7]],
    ];

    for (const [total, weights] of cases) {
      expect(sum(computeSharesAmounts(total, weights))).toBe(total);
    }
  });

  it("rejects invalid weights, totals and shapes", () => {
    expect(() => computeSharesAmounts(BigInt(10), [1, -1])).toThrow(/weight\[1\]/);
    expect(() => computeSharesAmounts(BigInt(10), [Number.NaN])).toThrow(/finite non-negative/);
    expect(() => computeSharesAmounts(BigInt(10), [Infinity])).toThrow(/finite non-negative/);
    expect(() => computeSharesAmounts(BigInt(-1), [1])).toThrow(/non-negative/);
    expect(() => computeSharesAmounts(BigInt(10), [0, 0])).toThrow(/sum to a positive/);
    expect(() => computeSharesAmounts(10 as unknown as bigint, [1])).toThrow(/must be bigint/);
    expect(() => computeSharesAmounts(BigInt(10), "1" as unknown as number[])).toThrow(/must be array/);
  });
});

describe("roundRobinRemainder", () => {
  it("hands out the remainder one unit at a time, wrapping around", () => {
    const amounts = [0, 0, 0];
    roundRobinRemainder(amounts, 5);
    expect(amounts).toEqual([2, 2, 1]);
  });

  it("changes nothing for a zero remainder or no slots", () => {
    const amounts = [1, 2];
    roundRobinRemainder(amounts, 0);
    expect(amounts).toEqual([1, 2]);
    expect(() => roundRobinRemainder([], 3)).not.toThrow();
  });

  it("rejects a negative or fractional remainder and a non-array", () => {
    expect(() => roundRobinRemainder([0], -1)).toThrow(/non-negative integer/);
    expect(() => roundRobinRemainder([0], 1.5)).toThrow(/non-negative integer/);
    expect(() => roundRobinRemainder("x" as unknown as number[], 1)).toThrow(/must be array/);
  });
});

describe("allocateEqualRemainder", () => {
  it("shares a total evenly, earlier participants getting the extra unit", () => {
    expect(allocateEqualRemainder(BigInt(10), 3)).toEqual([BigInt(4), BigInt(3), BigInt(3)]);
    expect(allocateEqualRemainder(BigInt(9), 3)).toEqual([BigInt(3), BigInt(3), BigInt(3)]);
  });

  it("stays exact past Number.MAX_SAFE_INTEGER", () => {
    const total = BigInt(10) ** BigInt(20) + BigInt(1);
    const shares = allocateEqualRemainder(total, 3);

    expect(sum(shares)).toBe(total);
    expect(shares[0]).toBe(shares[1]);
    expect((shares[0] ?? BigInt(0)) - (shares[2] ?? BigInt(0))).toBe(BigInt(1));
  });

  it("allocates nothing to nobody, but refuses to allocate a positive total to nobody", () => {
    expect(allocateEqualRemainder(BigInt(0), 0)).toEqual([]);
    expect(() => allocateEqualRemainder(BigInt(5), 0)).toThrow(/nobody/);
  });

  it("rejects a negative total and a bad participant count", () => {
    expect(() => allocateEqualRemainder(BigInt(-1), 2)).toThrow(/non-negative bigint/);
    expect(() => allocateEqualRemainder(5 as unknown as bigint, 2)).toThrow(/non-negative bigint/);
    expect(() => allocateEqualRemainder(BigInt(5), -1)).toThrow(/safe integer/);
    expect(() => allocateEqualRemainder(BigInt(5), 1.5)).toThrow(/safe integer/);
  });
});

describe("splitEqual / splitByPercentage / splitByCustom", () => {
  it("splits an amount equally and the shares add back to the total", () => {
    const shares = splitEqual("10", ["a", "b", "c"]);

    expect(shares).toEqual([
      { userId: "a", amount: "3.3333334" },
      { userId: "b", amount: "3.3333333" },
      { userId: "c", amount: "3.3333333" },
    ]);
    expect(sum(shares.map((s) => toStroops(s.amount)))).toBe(toStroops("10"));
  });

  it("returns nothing for an equal split among nobody", () => {
    expect(splitEqual("10", [])).toEqual([]);
  });

  it("splits by percentage", () => {
    expect(
      splitByPercentage("100", [
        { userId: "a", percent: 50 },
        { userId: "b", percent: 30 },
        { userId: "c", percent: 20 },
      ]).map((s) => s.amount),
    ).toEqual(["50.0000000", "30.0000000", "20.0000000"]);
  });

  it("keeps a percentage split exact when the percentages do not divide the total", () => {
    const shares = splitByPercentage("1", [
      { userId: "a", percent: 33.33 },
      { userId: "b", percent: 33.33 },
      { userId: "c", percent: 33.34 },
    ]);

    expect(shares.map((s) => s.amount)).toEqual(["0.3333000", "0.3333000", "0.3334000"]);
    expect(sum(shares.map((s) => toStroops(s.amount)))).toBe(toStroops("1"));
  });

  it("normalises custom amounts to seven decimals and ignores the stated total", () => {
    expect(
      splitByCustom("999", [
        { userId: "a", amount: "1.5" },
        { userId: "b", amount: "2" },
      ]),
    ).toEqual([
      { userId: "a", amount: "1.5000000" },
      { userId: "b", amount: "2.0000000" },
    ]);
  });
});

describe("parse helpers", () => {
  it("parseAmountStroops reads plain amounts only", () => {
    expect(parseAmountStroops("12.5")).toBe(BigInt(125_000_000));
    expect(parseAmountStroops(" 3 ")).toBe(BigInt(30_000_000));
    for (const bad of [null, undefined, "", "abc", "-1", "1.12345678", "1e3", "1,5"]) {
      expect(parseAmountStroops(bad)).toBeNull();
    }
  });

  it("parsePercentBasisPoints reads up to two decimals and nothing above 100", () => {
    expect(parsePercentBasisPoints("33.33")).toBe(3333);
    expect(parsePercentBasisPoints("100")).toBe(10_000);
    expect(parsePercentBasisPoints("5.5")).toBe(550);
    expect(parsePercentBasisPoints("0")).toBe(0);
    for (const bad of [null, undefined, "", "100.01", "12.345", "1000", "-5", "abc"]) {
      expect(parsePercentBasisPoints(bad)).toBeNull();
    }
  });

  it("formatBasisPoints drops trailing zeros and keeps the sign", () => {
    expect(formatBasisPoints(3333)).toBe("33.33");
    expect(formatBasisPoints(10_000)).toBe("100");
    expect(formatBasisPoints(550)).toBe("5.5");
    expect(formatBasisPoints(0)).toBe("0");
    expect(formatBasisPoints(5)).toBe("0.05");
    expect(formatBasisPoints(-250)).toBe("-2.5");
  });

  it("trimAmount drops trailing fractional zeros only", () => {
    expect(trimAmount("12.5000000")).toBe("12.5");
    expect(trimAmount("12.0000000")).toBe("12");
    expect(trimAmount("0.0000000")).toBe("0");
    expect(trimAmount("100")).toBe("100");
  });
});

describe("calculateSplit", () => {
  const people = ["a", "b", "c"].map((userId) => ({ userId }));

  it("equal: balances to the stroop and reports each share's basis points", () => {
    const result = calculateSplit("equal", "10", people);

    expect(result.rows.map((r) => r.amount)).toEqual(["3.3333334", "3.3333333", "3.3333333"]);
    expect(result.rows[0]?.basisPoints).toBe(3333);
    expect(result.allocatedStroops).toBe(BigInt(100_000_000));
    expect(result.remainingStroops).toBe(BigInt(0));
    expect(result.balance).toBe("balanced");
    expect(result.invalidRows).toEqual([]);
  });

  it("equal: is invalid without a readable total or without anyone to split with", () => {
    expect(calculateSplit("equal", "abc", people)).toMatchObject({
      totalStroops: null,
      balance: "invalid",
    });
    expect(calculateSplit("equal", "0", people).balance).toBe("invalid");
    expect(calculateSplit("equal", "10", [])).toMatchObject({ rows: [], balance: "invalid" });
  });

  it("custom: balanced, under and over allocation", () => {
    const rows = (a: string, b: string) => [
      { userId: "a", amount: a },
      { userId: "b", amount: b },
    ];

    const balanced = calculateSplit("custom", "10", rows("6", "4"));
    expect(balanced.balance).toBe("balanced");
    expect(balanced.rows.map((r) => r.basisPoints)).toEqual([6000, 4000]);

    const under = calculateSplit("custom", "10", rows("6", "3"));
    expect(under.balance).toBe("under");
    expect(under.remainingStroops).toBe(BigInt(10_000_000));

    const over = calculateSplit("custom", "10", rows("6", "5"));
    expect(over.balance).toBe("over");
    expect(over.remainingStroops).toBe(BigInt(-10_000_000));
  });

  it("custom: flags an unreadable row and keeps the others", () => {
    const result = calculateSplit("custom", "10", [
      { userId: "a", amount: "6" },
      { userId: "b", amount: "x" },
    ]);

    expect(result.invalidRows).toEqual([1]);
    expect(result.rows[1]).toMatchObject({ stroops: null, amount: null, basisPoints: null });
    expect(result.balance).toBe("invalid");
    expect(result.allocatedStroops).toBe(BigInt(60_000_000));
  });

  it("percentage: exact shares when the percentages add up to 100", () => {
    const result = calculateSplit("percentage", "100", [
      { userId: "a", percent: "50" },
      { userId: "b", percent: "30" },
      { userId: "c", percent: "20" },
    ]);

    expect(result.percentTotalBp).toBe(FULL_PERCENT_BP);
    expect(result.rows.map((r) => r.amount)).toEqual(["50.0000000", "30.0000000", "20.0000000"]);
    expect(result.balance).toBe("balanced");
    expect(result.allocatedStroops).toBe(result.totalStroops);
  });

  it("percentage: still sums to the total when the thirds do not divide it", () => {
    const result = calculateSplit("percentage", "1", [
      { userId: "a", percent: "33.33" },
      { userId: "b", percent: "33.33" },
      { userId: "c", percent: "33.34" },
    ]);

    expect(result.balance).toBe("balanced");
    expect(result.remainingStroops).toBe(BigInt(0));
  });

  it("percentage: previews a short or excess total without redistributing", () => {
    const under = calculateSplit("percentage", "100", [
      { userId: "a", percent: "50" },
      { userId: "b", percent: "30" },
    ]);
    expect(under.balance).toBe("under");
    expect(under.percentTotalBp).toBe(8000);
    expect(under.rows.map((r) => r.amount)).toEqual(["50.0000000", "30.0000000"]);

    const over = calculateSplit("percentage", "100", [
      { userId: "a", percent: "60" },
      { userId: "b", percent: "50" },
    ]);
    expect(over.balance).toBe("over");
    expect(over.percentTotalBp).toBe(11_000);
  });

  it("percentage: flags a malformed percentage", () => {
    const result = calculateSplit("percentage", "100", [
      { userId: "a", percent: "abc" },
      { userId: "b", percent: "50" },
    ]);

    expect(result.invalidRows).toEqual([0]);
    expect(result.rows[0]).toMatchObject({ stroops: null, basisPoints: null });
    expect(result.balance).toBe("invalid");
  });
});

describe("evenSplitValues", () => {
  const ids = ["a", "b", "c"];

  it("gives no rows for nobody", () => {
    expect(evenSplitValues("equal", "10", [])).toEqual([]);
  });

  it("percentage: three people get 33.34 / 33.33 / 33.33 so the total is 100", () => {
    const rows = evenSplitValues("percentage", "10", ids);

    expect(rows.map((r) => r.percent)).toEqual(["33.34", "33.33", "33.33"]);
  });

  it("custom: starts from exact trimmed amounts that add up to the total", () => {
    const rows = evenSplitValues("custom", "10", ids);

    expect(rows.map((r) => r.amount)).toEqual(["3.3333334", "3.3333333", "3.3333333"]);
  });

  it("custom: starts every row at zero while the total is unreadable", () => {
    expect(evenSplitValues("custom", "abc", ids).map((r) => r.amount)).toEqual(["0", "0", "0"]);
  });

  it("equal: carries no per-row value", () => {
    expect(evenSplitValues("equal", "10", ids).every((r) => r.amount === undefined)).toBe(true);
  });
});
