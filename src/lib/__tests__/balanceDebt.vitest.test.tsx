import { describe, expect, it } from "vitest";
import {
  aggregateBalancesByAsset,
  calculateTotalNetPosition,
  getSortedAggregatedBalances,
} from "../balanceAggregation";
import {
  aggregateBalancesInAsset,
  assetExchangeRates,
  convertBalanceAmount,
  formatAssetEquivalent,
} from "../currencyConversion";
import { amountToStroops } from "../currency";
import { simplifyDebts } from "../settlementUtils";
import { splitByPercentage, splitEqual, toStroops } from "../split";
import type { MemberBalance, User } from "../types";

function member(userId: string, net: string, assetCode = "XLM"): MemberBalance {
  const user: User = {
    id: userId,
    stellarPublicKey: `G${userId}`,
    displayName: userId,
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
  return { userId, user, net, assetCode };
}

type Settlement = ReturnType<typeof simplifyDebts>[number];

function signedStroops(amount: string): bigint {
  const value = amountToStroops(amount);
  if (value === null) throw new Error(`Expected a valid balance amount: ${amount}`);
  return value;
}

/** Apply suggested payments to each signed net and assert they stay valid. */
function remainingNets(
  balances: MemberBalance[],
  settlements: Settlement[],
): Map<string, bigint> {
  const key = (assetCode: string, userId: string) => `${assetCode}\u0000${userId}`;
  const initial = new Map<string, bigint>();
  const remaining = new Map<string, bigint>();
  const originalTotals = new Map<string, bigint>();

  for (const balance of balances) {
    const balanceKey = key(balance.assetCode, balance.userId);
    const net = signedStroops(balance.net);
    initial.set(balanceKey, (initial.get(balanceKey) ?? 0n) + net);
    remaining.set(balanceKey, (remaining.get(balanceKey) ?? 0n) + net);
    originalTotals.set(
      balance.assetCode,
      (originalTotals.get(balance.assetCode) ?? 0n) + net,
    );
  }

  for (const settlement of settlements) {
    const amount = toStroops(settlement.amount);
    expect(amount).toBeGreaterThan(0n);
    expect(settlement.fromUserId).not.toBe(settlement.toUserId);

    const fromKey = key(settlement.assetCode, settlement.fromUserId);
    const toKey = key(settlement.assetCode, settlement.toUserId);
    const fromInitial = initial.get(fromKey);
    const toInitial = initial.get(toKey);
    if (fromInitial === undefined || toInitial === undefined) {
      throw new Error("Settlement must reference balances in its asset bucket");
    }
    expect(fromInitial).toBeLessThan(0n);
    expect(toInitial).toBeGreaterThan(0n);

    const fromRemaining = remaining.get(fromKey);
    const toRemaining = remaining.get(toKey);
    if (fromRemaining === undefined || toRemaining === undefined) {
      throw new Error("Settlement participants must have initial balances");
    }
    remaining.set(fromKey, fromRemaining + amount);
    remaining.set(toKey, toRemaining - amount);
  }

  for (const [balanceKey, before] of initial) {
    const after = remaining.get(balanceKey);
    if (after === undefined) throw new Error("Every initial balance must have a remainder");
    if (before > 0n) {
      expect(after).toBeGreaterThanOrEqual(0n);
      expect(after).toBeLessThanOrEqual(before);
    } else if (before < 0n) {
      expect(after).toBeLessThanOrEqual(0n);
      expect(after).toBeGreaterThanOrEqual(before);
    } else {
      expect(after).toBe(0n);
    }
  }

  for (const [assetCode, total] of originalTotals) {
    const after = [...remaining.entries()]
      .filter(([balanceKey]) => balanceKey.startsWith(`${assetCode}\u0000`))
      .reduce((sum, [, net]) => sum + net, 0n);
    expect(after).toBe(total);
  }

  return remaining;
}

describe("balance aggregation", () => {
  it("handles a zero-balance single member and equal or unequal settled groups", () => {
    const solo = aggregateBalancesByAsset([member("solo", "0.0000000")]);
    expect(solo.get("XLM")).toMatchObject({ net: "0.0000000", netStroops: 0n, count: 1 });

    const equal = aggregateBalancesByAsset([
      member("alice", "5.0000000"),
      member("bob", "-5.0000000"),
    ]);
    expect(equal.get("XLM")).toMatchObject({ net: "0.0000000", netStroops: 0n, count: 2 });

    const unequal = aggregateBalancesByAsset([
      member("payer", "12.0000000"),
      member("member-a", "-4.0000000"),
      member("member-b", "-8.0000000"),
    ]);
    expect(unequal.get("XLM")).toMatchObject({ net: "0.0000000", netStroops: 0n, count: 3 });
    expect(aggregateBalancesByAsset([]).size).toBe(0);
  });

  it("keeps signed group balances separate by asset and filters a member", () => {
    const balances = [
      member("alice", "10.0000000", "XLM"),
      member("alice", "-2.5000000", "XLM"),
      member("bob", "-7.5000000", "XLM"),
      member("alice", "4.0000000", "USDC"),
      member("bob", "-1.0000000", "USDC"),
    ];

    const all = aggregateBalancesByAsset(balances);
    expect(all.get("XLM")).toMatchObject({
      assetCode: "XLM",
      net: "0.0000000",
      netStroops: 0n,
      count: 3,
    });
    expect(all.get("USDC")).toMatchObject({
      assetCode: "USDC",
      net: "3.0000000",
      netStroops: 30_000_000n,
      count: 2,
    });
    expect(getSortedAggregatedBalances(all).map(({ assetCode }) => assetCode)).toEqual([
      "USDC",
      "XLM",
    ]);

    const alice = aggregateBalancesByAsset(balances, "alice");
    expect(alice.get("XLM")?.net).toBe("7.5000000");
    expect(alice.get("USDC")?.net).toBe("4.0000000");
  });

  it("uses integer stroops, skips unreadable nets, and handles empty totals", () => {
    const rows = [
      member("a", "0.1000000"),
      member("b", "0.2000000"),
      member("c", "-0.0000001"),
      member("bad", "not-an-amount"),
    ];
    const aggregated = aggregateBalancesByAsset(rows);
    expect(aggregated.get("XLM")).toMatchObject({
      net: "0.2999999",
      netStroops: 2_999_999n,
      count: 3,
    });

    const position = calculateTotalNetPosition(aggregated);
    expect(position.totalStroops).toBe(2_999_999n);
    expect(position.byAsset.map(({ assetCode }) => assetCode)).toEqual(["XLM"]);
    expect(aggregateBalancesByAsset([]).size).toBe(0);
    expect(calculateTotalNetPosition(new Map()).totalStroops).toBe(0n);
  });
});

describe("expense split calculations", () => {
  it("distributes indivisible stroops in participant order and conserves the total", () => {
    const shares = splitEqual("0.0000013", ["a", "b", "c", "d", "e"]);
    expect(shares.map(({ amount }) => amount)).toEqual([
      "0.0000003",
      "0.0000003",
      "0.0000003",
      "0.0000002",
      "0.0000002",
    ]);
    expect(shares.reduce((sum, share) => sum + toStroops(share.amount), 0n)).toBe(
      toStroops("0.0000013"),
    );
  });

  it("handles one participant, zero totals, and rejected negative expense amounts", () => {
    expect(splitEqual("42.5", ["only"])).toEqual([
      { userId: "only", amount: "42.5000000" },
    ]);
    expect(splitEqual("0", ["a", "b"])).toEqual([
      { userId: "a", amount: "0.0000000" },
      { userId: "b", amount: "0.0000000" },
    ]);
    expect(splitEqual("0", [])).toEqual([]);
    expect(() => splitEqual("-1", ["a"])).toThrow(/non-negative/);
  });

  it("allocates percentage rounding remainders by largest fractional share", () => {
    const shares = splitByPercentage("0.0000010", [
      { userId: "a", percent: 33.33 },
      { userId: "b", percent: 33.33 },
      { userId: "c", percent: 33.34 },
    ]);
    expect(shares.map(({ amount }) => amount)).toEqual([
      "0.0000003",
      "0.0000003",
      "0.0000004",
    ]);
    expect(shares.reduce((sum, share) => sum + toStroops(share.amount), 0n)).toBe(10n);
  });
});

describe("simplified settlement calculations", () => {
  it("settles a two-person debt and emits nothing for empty or settled groups", () => {
    const debt = [member("debtor", "-12.5000000"), member("creditor", "12.5000000")];
    const paths = simplifyDebts(debt);
    expect(paths.map(({ fromUserId, toUserId, amount, assetCode }) => ({
      fromUserId,
      toUserId,
      amount,
      assetCode,
    }))).toEqual([
      { fromUserId: "debtor", toUserId: "creditor", amount: "12.5", assetCode: "XLM" },
    ]);
    expect([...remainingNets(debt, paths).values()]).toEqual([0n, 0n]);
    expect(simplifyDebts([])).toEqual([]);
    expect(simplifyDebts([member("a", "0"), member("b", "0.0000000")])).toEqual([]);
    expect(simplifyDebts([member("a", "-2"), member("b", "-3")])).toEqual([]);
    expect(simplifyDebts([member("a", "2"), member("b", "3")])).toEqual([]);
  });

  it("routes a multi-debtor, multi-creditor group without changing any net position", () => {
    const balances = [
      member("d1", "-6"),
      member("d2", "-4"),
      member("c1", "5"),
      member("c2", "5"),
    ];
    const paths = simplifyDebts(balances);

    // Several valid pairings exist; the helper's input-order greedy result is
    // stable while the invariant checks establish that it fully settles nets.
    expect(paths.map(({ fromUserId, toUserId, amount }) => [fromUserId, toUserId, amount])).toEqual([
      ["d1", "c1", "5"],
      ["d1", "c2", "1"],
      ["d2", "c2", "4"],
    ]);
    expect(paths).toHaveLength(3);
    expect([...remainingNets(balances, paths).values()]).toEqual([0n, 0n, 0n, 0n]);
  });

  it("supports one debtor with several creditors and several debtors with one creditor", () => {
    const oneDebtor = [
      member("debtor", "-6"),
      member("c1", "1"),
      member("c2", "2"),
      member("c3", "3"),
    ];
    const debtorPaths = simplifyDebts(oneDebtor);
    expect(debtorPaths.map(({ fromUserId, toUserId, amount }) => [
      fromUserId,
      toUserId,
      amount,
    ])).toEqual([
      ["debtor", "c1", "1"],
      ["debtor", "c2", "2"],
      ["debtor", "c3", "3"],
    ]);
    expect([...remainingNets(oneDebtor, debtorPaths).values()]).toEqual([0n, 0n, 0n, 0n]);

    const oneCreditor = [
      member("d1", "-1"),
      member("d2", "-2"),
      member("d3", "-3"),
      member("creditor", "6"),
    ];
    const creditorPaths = simplifyDebts(oneCreditor);
    expect(creditorPaths.map(({ fromUserId, toUserId, amount }) => [
      fromUserId,
      toUserId,
      amount,
    ])).toEqual([
      ["d1", "creditor", "1"],
      ["d2", "creditor", "2"],
      ["d3", "creditor", "3"],
    ]);
    expect([...remainingNets(oneCreditor, creditorPaths).values()]).toEqual([0n, 0n, 0n, 0n]);
  });

  it("settles each Stellar asset independently and never overpays an unbalanced group", () => {
    const balances = [
      member("debt-xlm", "-5", "XLM"),
      member("credit-xlm", "4", "XLM"),
      member("credit-usdc", "10", "USDC"),
      member("debt-usdc", "-8", "USDC"),
    ];
    const paths = simplifyDebts(balances);

    expect(paths.map(({ fromUserId, toUserId, amount, assetCode }) => [
      fromUserId,
      toUserId,
      amount,
      assetCode,
    ])).toEqual([
      ["debt-xlm", "credit-xlm", "4", "XLM"],
      ["debt-usdc", "credit-usdc", "8", "USDC"],
    ]);
    const remaining = remainingNets(balances, paths);
    expect(remaining.get("XLM\u0000debt-xlm")).toBe(-10_000_000n);
    expect(remaining.get("USDC\u0000credit-usdc")).toBe(20_000_000n);
    expect(simplifyDebts([member("credit", "5", "USDC"), member("debtor", "-5", "XLM")])).toEqual([]);
  });
});

describe("currency-aware balance calculations", () => {
  const rates = assetExchangeRates({ xlm: 0.12, usdc: 1 }, 1_700_000_000_000);

  it("converts signed balances and aggregates mixed assets in the requested asset", () => {
    expect(rates).not.toBeNull();
    expect(convertBalanceAmount("100", "XLM", "USDC", rates)).toBe("12.0000000");
    expect(convertBalanceAmount("-100", "XLM", "USDC", rates)).toBe("-12.0000000");
    expect(convertBalanceAmount("1.2345678", "USDC", "USDC", rates)).toBe("1.2345678");
    expect(
      aggregateBalancesInAsset(
        [
          { amount: "100", assetCode: "XLM" },
          { amount: "-2", assetCode: "USDC" },
        ],
        "USDC",
        rates,
      ),
    ).toBe("10.0000000");
    expect(formatAssetEquivalent("100", "XLM", "USDC", rates)).toBe("≈ 12.00 USDC");
  });

  it("rounds conversion to Stellar precision and returns no total for unavailable rates", () => {
    expect(convertBalanceAmount("1", "XLM", "USDC", { "XLM-USDC": 0.00000019 })).toBe(
      "0.0000002",
    );
    expect(assetExchangeRates({ xlm: 0, usdc: 1 })).toBeNull();
    expect(convertBalanceAmount("1", "XLM", "USDC", null)).toBeNull();
    expect(convertBalanceAmount("1", "XLM", "BTC", rates)).toBeNull();
    expect(aggregateBalancesInAsset([], "USDC", rates)).toBeNull();
    expect(
      aggregateBalancesInAsset(
        [
          { amount: "1", assetCode: "XLM" },
          { amount: "1", assetCode: "BTC" },
        ],
        "USDC",
        rates,
      ),
    ).toBeNull();
  });
});
