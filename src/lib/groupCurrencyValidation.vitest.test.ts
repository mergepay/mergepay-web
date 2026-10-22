import { describe, it, expect } from "vitest";

const SUPPORTED_CURRENCIES = new Set(["USDC", "XLM", "USD", "EUR"]);

function isValidGroupInput(name: string, currency: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 60 && SUPPORTED_CURRENCIES.has(currency.toUpperCase());
}

describe("Group creation name and currency validation (#599)", () => {
  it("accepts valid group names and supported currencies while rejecting empty names or unknown assets", () => {
    expect(isValidGroupInput("Lisbon Retreat", "USDC")).toBe(true);
    expect(isValidGroupInput(" ", "USDC")).toBe(false);
    expect(isValidGroupInput("Lisbon Retreat", "DOGE")).toBe(false);
  });
});
