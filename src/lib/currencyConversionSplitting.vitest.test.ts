import { describe, it, expect } from "vitest";
import { convertCurrency } from "./currency";
import { assetExchangeRates, formatBalanceWithFiat, convertBalanceAmount } from "./currencyConversion";
import { formatCurrencyAmount } from "./format";
import {
  computeSharesAmounts,
  fromStroops,
  splitByCustom,
  splitByPercentage,
  splitEqual,
  toStroops,
} from "./split";

describe("Currency conversion and expense splitting calculations (#600)", () => {
  it("distributes odd stroop remainders deterministically across equal splits", () => {
    const shares = splitEqual("100", ["alice", "bob", "carol"]);
    expect(shares).toEqual([
      { userId: "alice", amount: "33.3333334" },
      { userId: "bob", amount: "33.3333333" },
      { userId: "carol", amount: "33.3333333" },
    ]);
    const total = shares.reduce((acc, s) => acc + toStroops(s.amount), 0n);
    expect(fromStroops(total)).toBe("100.0000000");
  });

  it("handles zero amounts, percentage splits, and custom splits without rounding drift", () => {
    expect(computeSharesAmounts(0n, [1, 2, 3])).toEqual([0n, 0n, 0n]);
    const pct = splitByPercentage("50", [
      { userId: "alice", percent: 33.33 },
      { userId: "bob", percent: 33.33 },
      { userId: "carol", percent: 33.34 },
    ]);
    const pctSum = pct.reduce((acc, s) => acc + toStroops(s.amount), 0n);
    expect(fromStroops(pctSum)).toBe("50.0000000");

    const custom = splitByCustom("42.5", [
      { userId: "alice", amount: "20.25" },
      { userId: "bob", amount: "22.25" },
    ]);
    expect(custom).toEqual([
      { userId: "alice", amount: "20.2500000" },
      { userId: "bob", amount: "22.2500000" },
    ]);
  });

  it("converts multi-currency amounts and formats token + fiat displays", () => {
    expect(convertCurrency(100, "EUR", 1.08)).toBe("108");
    expect(formatCurrencyAmount("92", "USDC")).toBe("92.00 USDC");
    const display = formatBalanceWithFiat("100", "USDC", {
      fiatCurrency: "EUR",
      rates: { USDC: 0.92 },
    });
    expect(display.tokenText).toBe("100.00 USDC");
    expect(display.fiatText).toBe("~€92.00 EUR");
    expect(convertBalanceAmount("-20", "XLM", "USDC", assetExchangeRates({ xlm: 0.12, usdc: 1 }))).toBe("-2.4000000");
  });
});
