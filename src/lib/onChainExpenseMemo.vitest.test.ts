import { describe, expect, it } from "vitest";
import {
  formatExpenseMemo,
  parseExpenseMemo,
  sanitizeMemoInput,
  extractSettlementFromTransactionPayload,
} from "./memoValidation";

describe("Stellar on-chain expense memo formatting and parsing (#618)", () => {
  it("formats and parses structured expense memos within 28 UTF-8 bytes", () => {
    const memo = formatExpenseMemo({
      title: "Hotel Stay",
      amount: "120.50",
    });
    expect(memo).not.toBeNull();
    expect(memo!.startsWith("MP:")).toBe(true);
    expect(new TextEncoder().encode(memo!).length).toBeLessThanOrEqual(28);

    const parsed = parseExpenseMemo(memo);
    expect(parsed.valid).toBe(true);
    expect(parsed.prefix).toBe("MP:");
  });

  it("sanitizes control characters and extracts settlement info from Horizon payloads", () => {
    const cleaned = sanitizeMemoInput("  dinner\u0000\u0007-split  ");
    expect(cleaned).not.toContain("\u0000");

    const extracted = extractSettlementFromTransactionPayload({
      id: "tx-1",
      hash: "abc999",
      memo_type: "text",
      memo: "MP:dinner-8f3a",
      successful: true,
    });
    expect(extracted.matched).toBe(true);
    expect(extracted.shortCode).toBe("dinner-8f3a");
    expect(extracted.expenseSlug).toBe("dinner");
    expect(extracted.hashSuffix).toBe("8f3a");
  });
});
