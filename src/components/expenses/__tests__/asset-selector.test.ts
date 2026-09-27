import { describe, expect, it } from "vitest";
import { convertToFiat } from "@/hooks/useCurrencyRates";
import type { CryptoToFiatRates } from "@/hooks/useCurrencyRates";

const rates: CryptoToFiatRates = { xlm: 0.12, usdc: 1.0, live: true };

describe("convertToFiat (AssetSelector conversion)", () => {
  it("converts XLM and USDC to a two-decimal fiat string", () => {
    expect(convertToFiat("100", "XLM", rates)).toBe("12.00");
    expect(convertToFiat("100", "USDC", rates)).toBe("100.00");
  });

  it("accepts numeric input and trims to two decimals", () => {
    expect(convertToFiat("10.555", "XLM", rates)).toBe("1.27");
    expect(convertToFiat(120.5, "USDC", rates)).toBe("120.50");
  });

  it("returns null for untracked (custom trustline) assets", () => {
    expect(convertToFiat("50", "RANDOM", rates)).toBeNull();
  });

  it("rejects invalid, missing or negative amounts", () => {
    expect(convertToFiat("", "XLM", rates)).toBeNull();
    expect(convertToFiat("abc", "XLM", rates)).toBeNull();
    expect(convertToFiat("-5", "XLM", rates)).toBeNull();
  });

  it("returns null when the rate is zero/unavailable", () => {
    const dead: CryptoToFiatRates = { xlm: 0, usdc: 0, live: false };
    expect(convertToFiat("10", "XLM", dead)).toBeNull();
  });
});