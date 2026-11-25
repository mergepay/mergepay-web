import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatAmountInput } from "../amountInput";

describe("formatAmountInput — settling a committed amount entry", () => {
  it("adds the missing leading zero to a bare fraction", () => {
    assert.equal(formatAmountInput(".5"), "0.5");
    assert.equal(formatAmountInput(".0000001"), "0.0000001");
  });

  it("leaves a trailing dot for the validator to flag", () => {
    assert.equal(formatAmountInput("5."), "5.");
    assert.equal(formatAmountInput("0."), "0.");
    assert.equal(formatAmountInput(" 7. "), "7.");
  });

  it("turns an empty or lone-dot entry into an empty field", () => {
    assert.equal(formatAmountInput(""), "");
    assert.equal(formatAmountInput("."), "");
    assert.equal(formatAmountInput("   "), "");
  });

  it("drops surrounding whitespace and redundant leading zeros", () => {
    assert.equal(formatAmountInput("  12.5  "), "12.5");
    assert.equal(formatAmountInput("007.50"), "7.50");
    assert.equal(formatAmountInput("0007"), "7");
    assert.equal(formatAmountInput("0"), "0");
    assert.equal(formatAmountInput("00.5"), "0.5");
  });

  it("never adds, removes or rounds a digit", () => {
    assert.equal(formatAmountInput("12.50"), "12.50");
    assert.equal(formatAmountInput("100"), "100");
    assert.equal(formatAmountInput("1.2345670"), "1.2345670");
    assert.equal(formatAmountInput("922337203685.4775807"), "922337203685.4775807");
  });

  it("leaves precision beyond 7 decimals for the validator to report", () => {
    assert.equal(formatAmountInput("1.12345678"), "1.12345678");
    assert.equal(formatAmountInput("0.00000001"), "0.00000001");
  });

  it("honours a custom decimal scale", () => {
    assert.equal(formatAmountInput(".25", 2), "0.25");
    assert.equal(formatAmountInput(".255", 2), ".255");
  });

  it("does not repair input that is not a plain unsigned decimal", () => {
    for (const junk of ["-5", "+5", "1e5", "1,000", "$5", "5abc", "1.2.3", "٣"]) {
      assert.equal(formatAmountInput(junk), junk);
    }
  });
});
