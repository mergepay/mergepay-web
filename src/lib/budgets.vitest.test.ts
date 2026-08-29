import { describe, expect, it } from "vitest";
import {
  assetToUsd,
  budgetTone,
  crossedBudgetThresholds,
  groupBudgetPercent,
  groupBudgetSpentStroops,
  spentInBudgetCurrency,
  type BudgetExpense,
} from "./budgets";

function expense(amount: string): BudgetExpense {
  return { amount, category: null, settled: false };
}

describe("groupBudgetSpentStroops", () => {
  it("sums amounts exactly using stroop integer math", () => {
    const stroops = groupBudgetSpentStroops([
      expense("10.5"),
      expense("0.0000001"),
      expense("2"),
    ]);
    // 10.5 + 0.0000001 + 2 = 12.5000001 → 125000001 stroops
    expect(stroops).toBe(125000001n);
  });

  it("skips unparseable amounts instead of zeroing the total", () => {
    const stroops = groupBudgetSpentStroops([
      expense("10"),
      expense("not-a-number"),
      expense(""),
    ]);
    expect(stroops).toBe(100000000n);
  });

  it("returns zero for an empty list", () => {
    expect(groupBudgetSpentStroops([])).toBe(0n);
  });
});

describe("assetToUsd", () => {
  it("treats USDC as 1:1 with USD", () => {
    expect(assetToUsd("USDC")).toBe(1);
  });

  it("uses the indicative rate for XLM and honors an override", () => {
    expect(assetToUsd("XLM")).toBe(0.5);
    expect(assetToUsd("XLM", 0.25)).toBe(0.25);
  });

  it("falls back to 1 for unknown assets and missing codes", () => {
    expect(assetToUsd("EUR")).toBe(1);
    expect(assetToUsd(null)).toBe(1);
  });
});

describe("spentInBudgetCurrency", () => {
  it("converts USDC spending into the budget currency", () => {
    // 100 USDC = 100 USD → EUR at the indicative rate (1 EUR = 1.09 USD).
    const spent = spentInBudgetCurrency({
      expenses: [expense("100")],
      assetCode: "USDC",
      currency: "EUR",
    });
    expect(spent).toBeCloseTo(100 / 1.09, 5);
  });

  it("converts XLM spending into the budget currency at the indicative rate", () => {
    const spent = spentInBudgetCurrency({
      expenses: [expense("10")],
      assetCode: "XLM",
      currency: "USD",
    });
    expect(spent).toBeCloseTo(10 * 0.5, 5);
  });

  it("returns null when there is no spending", () => {
    expect(
      spentInBudgetCurrency({ expenses: [], assetCode: "USDC", currency: "USD" })
    ).toBeNull();
  });
});

describe("groupBudgetPercent", () => {
  it("is zero when the budget is unconfigured or zero (safe division)", () => {
    expect(
      groupBudgetPercent({
        expenses: [expense("50")],
        assetCode: "USDC",
        limit: 0,
        currency: "USD",
      })
    ).toBe(0);
    expect(
      groupBudgetPercent({
        expenses: [expense("50")],
        assetCode: "USDC",
        limit: -10,
        currency: "USD",
      })
    ).toBe(0);
  });

  it("computes the consumed percentage", () => {
    const percent = groupBudgetPercent({
      expenses: [expense("100")],
      assetCode: "USDC",
      limit: 500,
      currency: "USD",
    });
    expect(percent).toBeCloseTo(20, 5);
  });

  it("can exceed 100 when spending is over budget", () => {
    const percent = groupBudgetPercent({
      expenses: [expense("120")],
      assetCode: "USDC",
      limit: 100,
      currency: "USD",
    });
    expect(percent).toBe(120);
  });
});

describe("budgetTone", () => {
  it("is lime under 80%, butter at 80–99%, flamingo at 100% and over", () => {
    expect(budgetTone(0)).toBe("lime");
    expect(budgetTone(79.9)).toBe("lime");
    expect(budgetTone(80)).toBe("butter");
    expect(budgetTone(99)).toBe("butter");
    expect(budgetTone(100)).toBe("flamingo");
    expect(budgetTone(150)).toBe("flamingo");
  });
});

describe("crossedBudgetThresholds", () => {
  it("reports an upward crossing of 80%", () => {
    expect(crossedBudgetThresholds(79, 81)).toEqual(["80"]);
  });

  it("reports an upward crossing of 100%", () => {
    expect(crossedBudgetThresholds(99, 101)).toEqual(["100"]);
  });

  it("reports both thresholds when crossed in one jump", () => {
    expect(crossedBudgetThresholds(40, 110)).toEqual(["80", "100"]);
  });

  it("does not re-trigger on downward movement", () => {
    expect(crossedBudgetThresholds(110, 50)).toEqual([]);
  });

  it("does not re-trigger when staying past a threshold", () => {
    expect(crossedBudgetThresholds(85, 90)).toEqual([]);
  });
});
