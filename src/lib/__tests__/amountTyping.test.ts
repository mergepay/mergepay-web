/**
 * Issue #520 — unit tests for the keystroke and commit rules behind the
 * currency / split-amount inputs in `src/lib/expenseValidation.ts`.
 *
 * These are the rules that decide what may reach form state at all, so they are
 * tested directly rather than only through a component: a value that never
 * enters state can never be submitted, which is the whole point of filtering on
 * input instead of only on submit.
 *
 * Uses node:test because `npm test` runs these through `tsx --test`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AMOUNT_DECIMAL_PLACES,
  PERCENT_DECIMAL_PLACES,
  amountFieldError,
  isBlockedDecimalKey,
  isTypableAmount,
  isTypablePercent,
} from "../expenseValidation";

describe("amount precision constants (#520)", () => {
  it("allows Stellar's full seven decimals for an amount", () => {
    assert.equal(AMOUNT_DECIMAL_PLACES, 7);
  });

  it("allows two decimals for a percentage share", () => {
    assert.equal(PERCENT_DECIMAL_PLACES, 2);
  });
});

describe("isBlockedDecimalKey", () => {
  it("blocks the exponent and sign keys a type=number field would accept", () => {
    for (const key of ["e", "E", "+", "-"]) {
      assert.equal(isBlockedDecimalKey(key), true, `${key} should be blocked`);
    }
  });

  it("allows digits, the decimal point and every non-character key", () => {
    for (const key of ["0", "9", ".", "Backspace", "Delete", "ArrowLeft", "Tab", "a"]) {
      assert.equal(isBlockedDecimalKey(key), false, `${key} should pass through`);
    }
  });
});

describe("isTypableAmount", () => {
  it("accepts a whole number and every way-station on the way to one", () => {
    for (const value of ["", "5", "5.", "12.5", ".5", "0", "0.", "00", "1.0000000"]) {
      assert.equal(isTypableAmount(value), true, `${JSON.stringify(value)} should be typable`);
    }
  });

  it("refuses a second decimal point", () => {
    assert.equal(isTypableAmount("1.2.3"), false);
    assert.equal(isTypableAmount("..5"), false);
  });

  it("refuses an eighth decimal, which the network cannot represent", () => {
    assert.equal(isTypableAmount("0.0000001"), true);
    assert.equal(isTypableAmount("0.00000009"), false);
    assert.equal(isTypableAmount("1.23456789"), false);
  });

  it("refuses signs, exponent notation, separators and letters", () => {
    for (const value of ["-5", "+5", "1e5", "1E5", "1,000", "5%", "abc", "5 ", "$5"]) {
      assert.equal(isTypableAmount(value), false, `${JSON.stringify(value)} should be refused`);
    }
  });
});

describe("isTypablePercent", () => {
  it("allows two decimals and nothing more", () => {
    assert.equal(isTypablePercent("33"), true);
    assert.equal(isTypablePercent("33.3"), true);
    assert.equal(isTypablePercent("33.34"), true);
    assert.equal(isTypablePercent("33.345"), false);
  });

  it("leaves the 100% ceiling to the schema, not the keystroke filter", () => {
    assert.equal(isTypablePercent("999"), true);
    assert.equal(isTypablePercent("100.00"), true);
  });

  it("refuses a negative percentage at the gate", () => {
    assert.equal(isTypablePercent("-1"), false);
  });
});

describe("amountFieldError", () => {
  it("reports nothing for an empty or half-typed field", () => {
    assert.equal(amountFieldError(""), null);
    assert.equal(amountFieldError("   "), null);
    assert.equal(amountFieldError("."), null);
  });

  it("accepts a plain positive amount", () => {
    assert.equal(amountFieldError("1"), null);
    assert.equal(amountFieldError("12.5"), null);
    assert.equal(amountFieldError("0.0000001"), null);
    assert.equal(amountFieldError(" 12.5 "), null);
  });

  it("treats a run of zeros as unfinished rather than wrong", () => {
    // "0" is the first character of "0.5"; scolding it mid-typing would make
    // the field unusable for any amount below one.
    assert.equal(amountFieldError("0"), null);
    assert.equal(amountFieldError("0."), null);
    assert.equal(amountFieldError("0.00"), null);
  });

  it("rejects zero once no further digit can save it", () => {
    assert.equal(amountFieldError("0.0000000"), "Amount must be greater than zero");
  });

  it("names the precision limit when the amount has too many decimals", () => {
    assert.equal(
      amountFieldError("0.00000009"),
      "Amount must have at most 7 decimal places"
    );
  });

  it("lets a caller tighten the scale, e.g. for a percentage", () => {
    assert.equal(amountFieldError("33.34", 2), null);
    assert.equal(
      amountFieldError("33.345", 2),
      "Amount must have at most 2 decimal places"
    );
  });

  it("rejects values that got past the filter, such as a restored draft", () => {
    assert.equal(
      amountFieldError("-5"),
      "Amount must be a plain number"
    );
    assert.equal(amountFieldError("1e5"), "Amount must be a plain number");
    assert.equal(amountFieldError("1,000"), "Amount must be a plain number");
    assert.equal(amountFieldError("abc"), "Amount must be a plain number");
  });

  it("uses the caller's scale to decide when zero is final", () => {
    // At two decimals, "0.00" has no room left for a non-zero digit.
    assert.equal(amountFieldError("0.00", 2), "Amount must be greater than zero");
    assert.equal(amountFieldError("0.0", 2), null);
  });
});
