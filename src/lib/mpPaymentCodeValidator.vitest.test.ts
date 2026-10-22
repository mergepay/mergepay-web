import { describe, expect, it } from "vitest";
import {
  validateShortCode,
  mergepaySettlementMemoSchema,
  stellarTextMemoSchema,
  STELLAR_MEMO_MAX_BYTES,
  MAX_SHORT_CODE_BYTES,
} from "./memoValidation";

describe("Stellar MP payment code memo validator (#625)", () => {
  it("validates well-formed short codes within the 25-byte budget", () => {
    const res = validateShortCode("lunch-4a9c");
    expect(res.valid).toBe(true);
    expect(res.byteLength).toBeLessThanOrEqual(MAX_SHORT_CODE_BYTES);
  });

  it("rejects empty short codes, leading/trailing spaces, embedded MP: prefixes, or control chars", () => {
    expect(validateShortCode("").valid).toBe(false);
    expect(validateShortCode(" leading-space ").valid).toBe(false);
    expect(validateShortCode("MP:nested").valid).toBe(false);
    expect(validateShortCode("bad\u0007char").valid).toBe(false);
  });

  it("enforces MP: prefix and 28-byte UTF-8 constraint via Zod schemas", () => {
    expect(mergepaySettlementMemoSchema.safeParse("MP:rent-2026").success).toBe(true);
    expect(mergepaySettlementMemoSchema.safeParse("rent-2026").success).toBe(false);
    expect(
      stellarTextMemoSchema.safeParse("a".repeat(STELLAR_MEMO_MAX_BYTES + 1)).success
    ).toBe(false);
  });
});
