import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  avatarColor,
  formatAmount,
  formatCurrencyAmount,
  formatMoney,
  initials,
  shortHash,
  shortKey,
} from "../format";

describe("Localized Currency Formatting and Asset Precision (#XLM_USDC, #332)", () => {
  it("handles zero amounts correctly without fabrication", () => {
    assert.equal(formatCurrencyAmount("0", "XLM"), "0.00 XLM");
    assert.equal(formatCurrencyAmount("0.0000000", "USDC"), "0.00 USDC");
    assert.equal(formatCurrencyAmount("-0", "XLM"), "0.00 XLM");
    assert.equal(formatCurrencyAmount("+0.00", "USDC"), "0.00 USDC");
  });

  it("handles fractional precision and Stellar 7-decimal standard", () => {
    assert.equal(formatCurrencyAmount("1.5000000", "XLM"), "1.50 XLM");
    assert.equal(formatCurrencyAmount("1.5050000", "XLM"), "1.505 XLM");
    assert.equal(formatCurrencyAmount("0.0000001", "USDC"), "0.0000001 USDC");
    assert.equal(formatCurrencyAmount("1.00000005", "XLM"), "1.0000001 XLM");
    assert.equal(formatCurrencyAmount("1.00000004", "XLM"), "1.00 XLM");
  });

  it("handles large numbers with grouping separators correctly", () => {
    assert.equal(
      formatCurrencyAmount("1234567.8901234", "USDC"),
      "1,234,567.8901234 USDC"
    );
    assert.equal(
      formatCurrencyAmount("1000000000000.50", "XLM"),
      "1,000,000,000,000.50 XLM"
    );
    assert.equal(formatMoney("999999999.50", "XLM"), "999,999,999.50 XLM");
  });

  it("formats negative amounts with correct signs and grouping", () => {
    assert.equal(formatCurrencyAmount("-1234.56", "XLM"), "-1,234.56 XLM");
    assert.equal(formatCurrencyAmount("-0.0000001", "USDC"), "-0.0000001 USDC");
    assert.equal(formatCurrencyAmount("-0.00000001", "XLM"), "0.00 XLM");
  });

  it("normalises asset code whitespace and casing", () => {
    assert.equal(formatCurrencyAmount("100", " xlm "), "100.00 XLM");
    assert.equal(formatCurrencyAmount("100", "usdc"), "100.00 USDC");
  });

  it("handles null, undefined, or invalid amounts safely", () => {
    assert.equal(formatCurrencyAmount(null, "XLM"), "— XLM");
    assert.equal(formatCurrencyAmount(undefined, "USDC"), "— USDC");
    assert.equal(formatCurrencyAmount("invalid", "XLM"), "— XLM");
    assert.equal(formatCurrencyAmount(null, null), "—");
    assert.equal(formatCurrencyAmount("invalid", undefined), "—");
  });

  it("honours custom formatting options in formatCurrencyAmount", () => {
    assert.equal(
      formatCurrencyAmount("10.0", "XLM", { minDecimals: 0 }),
      "10 XLM"
    );
    assert.equal(
      formatCurrencyAmount("25.5", "XLM", { signDisplay: "always" }),
      "+25.50 XLM"
    );
    assert.equal(
      formatCurrencyAmount("-25.5", "XLM", { signDisplay: "always" }),
      "-25.50 XLM"
    );
    assert.equal(
      formatCurrencyAmount("0", "XLM", { signDisplay: "always" }),
      "0.00 XLM"
    );
    assert.equal(
      formatCurrencyAmount("1234.5", "USDC", { locale: "de-DE" }),
      "1.234,50 USDC"
    );
  });
});

describe("formatMoney helper (#332)", () => {
  it("formats amount with asset code", () => {
    assert.equal(formatMoney("100.5", "USDC"), "100.50 USDC");
    assert.equal(formatMoney("-50.25", "XLM"), "-50.25 XLM");
  });

  it("supports options like signDisplay in formatMoney", () => {
    assert.equal(
      formatMoney("50", "XLM", { signDisplay: "always" }),
      "+50.00 XLM"
    );
  });

  it("returns fallback for invalid input in formatMoney", () => {
    assert.equal(formatMoney("bad", "XLM"), "—");
  });
});

describe("formatAmount helper (#332)", () => {
  it("formats decimal amounts without asset code", () => {
    assert.equal(formatAmount("1234567.89"), "1,234,567.89");
    assert.equal(formatAmount("0"), "0.00");
    assert.equal(formatAmount("-42.50"), "-42.50");
    assert.equal(formatAmount("0.0012345"), "0.0012345");
  });

  it("respects decimal options in formatAmount", () => {
    assert.equal(formatAmount("1.5", { minDecimals: 0 }), "1.5");
    assert.equal(formatAmount("1.234567", { maxDecimals: 4 }), "1.2346");
  });

  it("returns fallback for invalid input in formatAmount", () => {
    assert.equal(formatAmount(null), "—");
    assert.equal(formatAmount("abc"), "—");
  });
});

describe("Key and Hash formatting utilities (#332)", () => {
  it("truncates Stellar public keys correctly", () => {
    const pubKey = "GBBD67VSEIPFSTPGE6W65P4H3N2H5I5Q6F7Y3D4R5C6V7B8N9M0KFLA5";
    assert.equal(shortKey(pubKey, 4), "GBBD…FLA5");
    assert.equal(shortKey(pubKey, 6), "GBBD67…0KFLA5");
  });

  it("leaves short keys untruncated", () => {
    assert.equal(shortKey("GBBD", 4), "GBBD");
    assert.equal(shortKey("", 4), "");
  });

  it("truncates transaction hashes correctly", () => {
    const hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    assert.equal(shortHash(hash, 6), "e3b0c4…52b855");
    assert.equal(shortHash(hash, 4), "e3b0…b855");
  });
});

describe("Initials and Avatar Color helpers (#332)", () => {
  it("extracts initials correctly from names", () => {
    assert.equal(initials("Alice"), "A");
    assert.equal(initials("Alice Smith"), "AS");
    assert.equal(initials("Alice Bob Charlie"), "AB");
    assert.equal(initials("  john   doe  "), "JD");
    assert.equal(initials(""), "");
  });

  it("generates deterministic avatar colors from seeds", () => {
    const color1 = avatarColor("user_123");
    const color2 = avatarColor("user_123");
    const color3 = avatarColor("user_456");
    assert.equal(color1, color2);
    assert.match(color1, /^#[0-9A-F]{6}$/i);
    assert.match(color3, /^#[0-9A-F]{6}$/i);
  });
});

