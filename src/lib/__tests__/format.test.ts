import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatAmount,
  formatCurrencyAmount,
  formatMoney,
  initials,
  shortHash,
  shortKey,
} from "../format";
import {
  AMOUNT_MAX_DECIMALS,
  AMOUNT_MIN_DECIMALS,
  amountToStroops,
  parseDecimalDigits,
} from "../currency";

// ---------------------------------------------------------------------------
// formatCurrencyAmount — the public XLM/USDC amount formatter
// ---------------------------------------------------------------------------
describe("formatCurrencyAmount — XLM/USDC display helper (#320)", () => {
  it("formats zero amounts without fabricating a sign", () => {
    assert.equal(formatCurrencyAmount("0", "XLM"), "0.00 XLM");
    assert.equal(formatCurrencyAmount("-0", "XLM"), "0.00 XLM");
    assert.equal(formatCurrencyAmount("0.0000000", "USDC"), "0.00 USDC");
  });

  it("keeps exact 7-decimal precision (stroop-level)", () => {
    assert.equal(formatCurrencyAmount("0.0000001", "XLM"), "0.0000001 XLM");
    assert.equal(formatCurrencyAmount("1.1234567", "USDC"), "1.1234567 USDC");
    // Sub-stroop values round half-away-from-zero; never invent digits.
    assert.equal(formatCurrencyAmount("1.00000005", "XLM"), "1.0000001 XLM");
    assert.equal(formatCurrencyAmount("1.00000004", "XLM"), "1.00 XLM");
  });

  it("handles very large balances without losing digit integrity", () => {
    assert.equal(
      formatCurrencyAmount("1234567.8901234", "USDC"),
      "1,234,567.8901234 USDC"
    );
    assert.equal(
      formatCurrencyAmount("1000000000000000000", "XLM"),
      "1,000,000,000,000,000,000.00 XLM"
    );
  });

  it("normalises asset code casing/whitespace and handles unknowns", () => {
    assert.equal(formatCurrencyAmount("100", " xlm "), "100.00 XLM");
    assert.equal(formatCurrencyAmount("100", "usdc"), "100.00 USDC");
    assert.equal(formatCurrencyAmount("100", "ETH"), "100.00 ETH");
  });

  it("never fabricates a value for missing or invalid amounts", () => {
    assert.equal(formatCurrencyAmount(null, "XLM"), "— XLM");
    assert.equal(formatCurrencyAmount(undefined, "USDC"), "— USDC");
    assert.equal(formatCurrencyAmount("invalid", "XLM"), "— XLM");
    assert.equal(formatCurrencyAmount(null, null), "—");
  });
});

// ---------------------------------------------------------------------------
// formatMoney / formatAmount — thin wrappers over the same rules
// ---------------------------------------------------------------------------
describe("formatMoney and formatAmount (#320)", () => {
  it("pads to a two-decimal minimum and groups large integers", () => {
    assert.equal(formatMoney("10.00", "XLM"), "10.00 XLM");
    assert.equal(formatMoney("1234567.89", "USDC"), "1,234,567.89 USDC");
  });

  it("renders asset-less amounts for formatAmount", () => {
    assert.equal(formatAmount("0"), "0.00");
    assert.equal(formatAmount("1234567.89"), "1,234,567.89");
  });

  it("supports precision overrides", () => {
    assert.equal(
      formatCurrencyAmount("10.0", "XLM", { minDecimals: 0 }),
      "10 XLM"
    );
    assert.equal(
      formatCurrencyAmount("25.5", "XLM", { signDisplay: "always" }),
      "+25.50 XLM"
    );
  });
});

// ---------------------------------------------------------------------------
// shortKey / shortHash — public key truncation
// ---------------------------------------------------------------------------
describe("public key and hash truncation (#320)", () => {
  it("truncates a 56-char Stellar public key to (chars)…(chars)", () => {
    const pubKey = "GBBD67VSEIPFSTPGE6W65P4H3N2H5I5Q6F7Y3D4R5C6V7B8N9M0KFLA5";
    assert.equal(shortKey(pubKey, 4), "GBBD…FLA5");
    assert.equal(shortKey(pubKey, 6), "GBBD67…0KFLA5");
  });

  it("leaves short or empty keys untruncated", () => {
    assert.equal(shortKey("GBBD", 4), "GBBD");
    assert.equal(shortKey("", 4), "");
  });

  it("truncates transaction hashes", () => {
    const hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    assert.equal(shortHash(hash, 6), "e3b0c4…52b855");
  });
});

// ---------------------------------------------------------------------------
// Exact-decimal helpers backing the formatters — regression guards for the
// “no floating point inaccuracies” requirement.
// ---------------------------------------------------------------------------
describe("exact decimal parsing and rounding (#320)", () => {
  it("parses 7-decimal strings exactly", () => {
    assert.deepEqual(parseDecimalDigits("1.1234567"), {
      negative: false,
      int: "1",
      frac: "1234567",
    });
  });

  it("rounds half-away-from-zero at stroop precision", () => {
    assert.equal(amountToStroops("1.12345675"), 11234568n);
    assert.equal(amountToStroops("1.12345674"), 11234567n);
  });

  it("exposes the Stellar precision constants for callers", () => {
    assert.equal(AMOUNT_MAX_DECIMALS, 7);
    assert.equal(AMOUNT_MIN_DECIMALS, 2);
  });
});

// ---------------------------------------------------------------------------
// initials — small deterministic helper shipped with the formatters
// ---------------------------------------------------------------------------
describe("initials (#320)", () => {
  it("extracts at most two initials from a display name", () => {
    assert.equal(initials("Alice Smith"), "AS");
    assert.equal(initials("Alice Bob Charlie"), "AB");
    assert.equal(initials("  john   doe  "), "JD");
    assert.equal(initials(""), "");
  });
});