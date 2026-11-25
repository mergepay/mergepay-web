import { describe, expect, it } from "vitest";
import {
  buildSettlementMemo,
  validateMemo,
  parseSettlementMemo,
  breakdownMemo,
  detectMemoDeviations,
  extractExpenseReferenceFromMemo,
} from "./memo";

describe("Transaction memo formatting and verification utilities (#633)", () => {
  it("builds and validates compliant MP:<code> settlement memos within 28 bytes", () => {
    const built = buildSettlementMemo("hotel-9a1b");
    expect(built).toBe("MP:hotel-9a1b");

    const checked = validateMemo(built);
    expect(checked.valid).toBe(true);
    expect(checked.byteLength).toBe(13);
  });

  it("rejects empty memos, control characters, or memos exceeding Stellar 28-byte limit", () => {
    expect(validateMemo("").valid).toBe(false);
    expect(validateMemo("MP:bad\u0000char").valid).toBe(false);

    const tooLong = validateMemo("MP:abcdefghijklmnopqrstuvwxyz012345");
    expect(tooLong.valid).toBe(false);
    expect(tooLong.byteLength).toBeGreaterThan(28);
  });

  it("parses settlement memos and detects formatting deviations", () => {
    const parsed = parseSettlementMemo("MP:dinner-4f2c");
    expect(parsed).toEqual({
      valid: true,
      prefix: "MP:",
      shortCode: "dinner-4f2c",
    });

    const missingPrefix = parseSettlementMemo("dinner-4f2c");
    expect(missingPrefix.valid).toBe(false);

    const deviations = detectMemoDeviations("mp: dinner-4f2c ", "MP:dinner-4f2c");
    expect(deviations.length).toBeGreaterThan(0);

    const breakdown = breakdownMemo("MP:dinner-4f2c");
    expect(breakdown.prefix).toBe("MP:");
    expect(breakdown.shortCode).toBe("dinner-4f2c");
    expect(breakdown.remainingBytes).toBe(28 - "MP:dinner-4f2c".length);
  });

  it("extracts expense reference from valid on-chain memo strings", () => {
    const ref = extractExpenseReferenceFromMemo("MP:flight-77ef");
    expect(ref.valid).toBe(true);
    expect(ref.shortCode).toBe("flight-77ef");
    expect(ref.expenseSlug).toBe("flight");
    expect(ref.hashSuffix).toBe("77ef");
  });
});
