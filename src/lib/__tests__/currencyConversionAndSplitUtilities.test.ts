// ---------------------------------------------------------------------------
// Issue #600 — unit tests for the currency conversion and expense splitting
// calculation utilities.
//
// The helpers in `src/lib/split.ts` and `src/lib/currencyConversion.ts` move
// real money, so every share they emit must be an integer-stroop amount that
// sums back to the requested total, and every fiat estimate must round at the
// precision the caller asked for. These tests pin down the edge cases the
// issue calls out — odd remainder distribution, zero amounts and multi-currency
// rounding — plus the option matrix of the conversion display helpers.
// ---------------------------------------------------------------------------

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fromStroops,
  splitByCustom,
  splitByPercentage,
  splitEqual,
  toStroops,
} from "../split";
import {
  assetExchangeRates,
  convertBalanceAmount,
  formatBalanceWithFiat,
} from "../currencyConversion";
import { convertAmount } from "../exchange";

const sum = (shares: Array<{ amount: string }>) =>
  shares.reduce((s, share) => s + toStroops(share.amount), 0n);

describe("Split calculation helpers — remainder distribution (#600)", () => {
  it("hands the indivisible remainder to the earliest members and conserves the total", () => {
    // 13 stroops across 5 members cannot divide evenly: the first three
    // members pick up the extra stroop each, in input order.
    const shares = splitEqual("0.0000013", ["a", "b", "c", "d", "e"]);
    assert.deepEqual(
      shares.map((s) => s.amount),
      ["0.0000003", "0.0000003", "0.0000003", "0.0000002", "0.0000002"]
    );
    assert.equal(sum(shares), toStroops("0.0000013"));
  });

  it("splits an odd total 50/50 without losing or inventing a stroop", () => {
    // 99,999,999 stroops halve to 49,999,999.5 — the tie goes to the first
    // participant so the two shares still add up to the exact total.
    const shares = splitByPercentage("9.9999999", [
      { userId: "a", percent: 50 },
      { userId: "b", percent: 50 },
    ]);
    assert.deepEqual(
      shares.map((s) => s.amount),
      ["5.0000000", "4.9999999"]
    );
    assert.equal(sum(shares), toStroops("9.9999999"));
  });

  it("places repeating-decimal percentage dust on the member with the largest share", () => {
    // 33.33 / 33.33 / 33.34 over 10 stroops: the member with 33.34% owns the
    // largest fractional remainder and receives the leftover stroop.
    const shares = splitByPercentage("0.0000010", [
      { userId: "a", percent: 33.33 },
      { userId: "b", percent: 33.33 },
      { userId: "c", percent: 33.34 },
    ]);
    assert.deepEqual(
      shares.map((s) => s.amount),
      ["0.0000003", "0.0000003", "0.0000004"]
    );
    assert.equal(sum(shares), toStroops("0.0000010"));
  });

  it("gives a 0% participant nothing and the rest the whole amount", () => {
    const shares = splitByPercentage("10", [
      { userId: "a", percent: 0 },
      { userId: "b", percent: 100 },
    ]);
    assert.deepEqual(
      shares.map((s) => s.amount),
      ["0.0000000", "10.0000000"]
    );
    assert.equal(sum(shares), toStroops("10"));
  });

  it("produces all-zero shares for a zero total in every split mode", () => {
    const equal = splitEqual("0", ["a", "b", "c"]);
    assert.deepEqual(
      equal.map((s) => s.amount),
      ["0.0000000", "0.0000000", "0.0000000"]
    );

    const percentage = splitByPercentage("0", [
      { userId: "a", percent: 50 },
      { userId: "b", percent: 50 },
    ]);
    assert.deepEqual(
      percentage.map((s) => s.amount),
      ["0.0000000", "0.0000000"]
    );

    const custom = splitByCustom("0", [
      { userId: "a", amount: "0" },
      { userId: "b", amount: "0.0000000" },
    ]);
    assert.deepEqual(
      custom.map((s) => s.amount),
      ["0.0000000", "0.0000000"]
    );
  });

  it("normalises custom amounts to the 7-decimal wire format without re-rounding them", () => {
    const shares = splitByCustom("10", [
      { userId: "a", amount: "7.5" },
      { userId: "b", amount: "2.5" },
    ]);
    assert.deepEqual(
      shares.map((s) => s.amount),
      ["7.5000000", "2.5000000"]
    );
    assert.equal(sum(shares), toStroops("10"));
    assert.deepEqual(splitByCustom("10", []), []);
  });

  it("keeps every share an exact 7-decimal string round-tripping through stroops", () => {
    const shares = splitEqual("1234.5678901", ["a", "b", "c"]);
    for (const share of shares) {
      assert.match(share.amount, /^\d+\.\d{7}$/);
      assert.equal(fromStroops(toStroops(share.amount)), share.amount);
    }
    assert.equal(sum(shares), toStroops("1234.5678901"));
  });
});

describe("Currency conversion helpers — rounding and options (#600)", () => {
  it("rounds a conversion to the nearest stroop instead of truncating", () => {
    // 1 × 0.00000019 = 0.00000019 — the nearest stroop is 0.0000002; a
    // truncating implementation would silently keep 0.0000001.
    assert.equal(
      convertAmount("1", "XLM", "USDC", { "XLM-USDC": 0.00000019 }),
      "0.0000002"
    );
  });

  it("makes a conversion through a repeating cross rate land exactly", () => {
    // 1/0.12 = 8.3333… USDC→XLM; dividing the inverse back out must still
    // return the exact 12 USDC the user was shown.
    const rates = assetExchangeRates({ xlm: 0.12, usdc: 1 });
    assert.equal(
      convertBalanceAmount("100", "XLM", "USDC", rates),
      "12.0000000"
    );
  });

  it("carries the fetch timestamp through and defaults to a non-live rate", () => {
    const stamped = assetExchangeRates({ xlm: 0.5, usdc: 1 }, 1700000000000);
    assert.equal(stamped?.timestamp, 1700000000000);
    assert.equal(stamped?.live, false);
    assert.equal(assetExchangeRates({ xlm: 0.5, usdc: 1, live: true })?.live, true);
  });

  describe("formatBalanceWithFiat — display options", () => {
    it("rounds the fiat estimate to the decimals the caller asked for", () => {
      const rates = { XLM: 0.1234567 };

      assert.equal(
        formatBalanceWithFiat("10", "XLM", { rates, fiatDecimals: 2 }).fiatText,
        "~$1.23 USD"
      );
      assert.equal(
        formatBalanceWithFiat("10", "XLM", { rates, fiatDecimals: 4 }).fiatText,
        "~$1.2346 USD"
      );
      // Whole figures stay whole at zero decimals — no trailing ".00".
      assert.equal(
        formatBalanceWithFiat("100", "XLM", { rates: { XLM: 0.12 }, fiatDecimals: 0 }).fiatText,
        "~$12 USD"
      );
    });

    it("supplies the built-in symbol for known fiat currencies", () => {
      assert.equal(
        formatBalanceWithFiat("10", "XLM", { rates: { XLM: 0.5 }, fiatCurrency: "GBP" }).fiatText,
        "~£5.00 GBP"
      );
      assert.equal(
        formatBalanceWithFiat("2", "XLM", { rates: { XLM: 150.5 }, fiatCurrency: "JPY" }).fiatText,
        "~¥301.00 JPY"
      );
    });

    it("falls back to the currency code for a currency with no built-in symbol", () => {
      const result = formatBalanceWithFiat("10", "XLM", {
        rates: { XLM: 0.5 },
        fiatCurrency: "CHF",
      });
      assert.equal(result.fiatText, "~CHF 5.00 CHF");
      assert.equal(result.hasFiat, true);
    });

    it("reports no fiat when the rate map is null", () => {
      const result = formatBalanceWithFiat("10", "XLM", { rates: null });
      assert.equal(result.fiatText, null);
      assert.equal(result.hasFiat, false);
      assert.equal(result.tokenText, "10.00 XLM");
    });

    it("matches the asset code case-insensitively and with stray whitespace", () => {
      const result = formatBalanceWithFiat("10", " xlm ", { rates: { XLM: 0.5 } });
      assert.equal(result.tokenText, "10.00 XLM");
      assert.equal(result.fiatText, "~$5.00 USD");
      assert.equal(result.hasFiat, true);
    });

    it("still shows an exact zero estimate for a zero balance", () => {
      const result = formatBalanceWithFiat("0", "XLM", { rates: { XLM: 0.12 } });
      assert.equal(result.fiatText, "~$0.00 USD");
      assert.equal(result.hasFiat, true);
      assert.equal(result.isLoading, false);
    });
  });
});
