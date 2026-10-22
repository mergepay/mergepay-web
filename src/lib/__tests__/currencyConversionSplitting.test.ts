import test from "node:test";
import assert from "node:assert/strict";
import { convertCurrency } from "../currency";
import { formatBalanceWithFiat } from "../currencyConversion";
import { splitByPercentage, splitEqual, toStroops, fromStroops } from "../split";

test("equal and percentage splits conserve exact stroop totals (#600)", () => {
  const equal = splitEqual("10", ["u1", "u2", "u3"]);
  assert.equal(equal[0]?.amount, "3.3333334");
  assert.equal(equal[1]?.amount, "3.3333333");
  assert.equal(equal[2]?.amount, "3.3333333");

  const pct = splitByPercentage("100", [
    { userId: "u1", percent: 50 },
    { userId: "u2", percent: 30 },
    { userId: "u3", percent: 20 },
  ]);
  const sum = pct.reduce((acc, row) => acc + toStroops(row.amount), 0n);
  assert.equal(fromStroops(sum), "100.0000000");
});

test("multi-currency fiat conversion handles valid and missing rates (#600)", () => {
  assert.equal(convertCurrency("50", "USD", 1), "50");
  const converted = formatBalanceWithFiat("25", "XLM", {
    fiatCurrency: "USD",
    rates: { XLM: 0.12 },
  });
  assert.equal(converted.fiatText, "~$3.00 USD");
  const missing = formatBalanceWithFiat("25", "XLM", { fiatCurrency: "USD", rates: null });
  assert.equal(missing.hasFiat, false);
});
