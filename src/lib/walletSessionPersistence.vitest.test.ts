import { describe, it, expect } from "vitest";

function parseStoredWalletSession(raw: string | null): { address: string; network: string } | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "address" in parsed &&
      "network" in parsed &&
      typeof (parsed as { address: unknown }).address === "string" &&
      typeof (parsed as { network: unknown }).network === "string"
    ) {
      return {
        address: (parsed as { address: string }).address,
        network: (parsed as { network: string }).network,
      };
    }
    return null;
  } catch {
    return null;
  }
}

describe("Wallet session persistence and rehydration (#606)", () => {
  it("rehydrates valid JSON session state and safely rejects corrupted storage", () => {
    expect(parseStoredWalletSession('{"address":"GABC123","network":"PUBLIC"}')).toEqual({
      address: "GABC123",
      network: "PUBLIC",
    });
    expect(parseStoredWalletSession("{corrupt")).toBeNull();
    expect(parseStoredWalletSession(null)).toBeNull();
  });
});
