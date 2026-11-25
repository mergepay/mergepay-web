import { describe, it, expect } from "vitest";

function requiresTrustlineWarning(assetCode: string, hasTrustline: boolean, balance: number, requiredAmount: number): string | null {
  if (assetCode.toUpperCase() === "XLM") return null;
  if (!hasTrustline) return `Missing ${assetCode.toUpperCase()} trustline on your Stellar account.`;
  if (balance < requiredAmount) return `Insufficient ${assetCode.toUpperCase()} balance for this settlement.`;
  return null;
}

describe("Non-XLM trustline and balance warning evaluation (#605)", () => {
  it("flags missing USDC trustlines and insufficient balances while bypassing native XLM", () => {
    expect(requiresTrustlineWarning("XLM", false, 0, 50)).toBeNull();
    expect(requiresTrustlineWarning("USDC", false, 100, 10)).toContain("Missing USDC trustline");
    expect(requiresTrustlineWarning("USDC", true, 5, 25)).toContain("Insufficient USDC balance");
    expect(requiresTrustlineWarning("USDC", true, 100, 25)).toBeNull();
  });
});
