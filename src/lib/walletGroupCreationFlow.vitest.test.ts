import { describe, expect, it } from "vitest";
import { STELLAR_PUBLIC_KEY_REGEX } from "./validation";

describe("Wallet connection and group creation flow (#620)", () => {
  it("validates connected 56-character Stellar public key format", () => {
    const validKey = "G" + "A".repeat(55);
    expect(STELLAR_PUBLIC_KEY_REGEX.test(validKey)).toBe(true);
    expect(STELLAR_PUBLIC_KEY_REGEX.test("INVALID_KEY")).toBe(false);
  });
});
