import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatCurrencyAmount,
  formatMoney,
  initials,
  shortHash,
  shortKey,
} from "./format";
import {
  extractExpenseReferenceFromMemo,
  formatExpenseMemo,
  parseExpenseMemo,
  parseSettlementMemo,
} from "./memoValidation";
import {
  createGroupFormSchema,
  fieldErrorsFrom,
  participantSplitSchema,
} from "./validators";

describe("src/lib shared formatting, memo, and validator helpers (#646)", () => {
  it("formats Stellar amounts and truncates keys/hashes deterministically", () => {
    expect(formatCurrencyAmount("42.5", "XLM")).toBe("42.50 XLM");
    expect(formatMoney("1000", "USDC")).toBe("1,000.00 USDC");
    expect(formatAmount("0.1234567")).toBe("0.1234567");
    expect(
      shortKey("GBBD67VSEIPFSTPGE6W65P4H3N2H5I5Q6F7Y3D4R5C6V7B8N9M0KFLA5", 4)
    ).toBe("GBBD…FLA5");
    expect(
      shortHash(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        6
      )
    ).toBe("e3b0c4…52b855");
    expect(initials("Ada Lovelace")).toBe("AL");
  });

  it("formats and parses Mergepay settlement memos within the 28-byte Stellar limit", () => {
    const memo = formatExpenseMemo({ title: "Team Dinner", amount: "120.00" });
    expect(memo).toMatch(/^MP:team-dinner-[a-z0-9]+$/);

    const parsed = parseExpenseMemo(memo);
    expect(parsed.valid).toBe(true);
    expect(parsed.prefix).toBe("MP:");
    expect(parsed.byteLength).toBeLessThanOrEqual(28);

    const settlement = parseSettlementMemo("MP:hotel-9a1b");
    expect(settlement).toEqual({
      valid: true,
      prefix: "MP:",
      shortCode: "hotel-9a1b",
    });

    const ref = extractExpenseReferenceFromMemo("MP:hotel-room-9a1b");
    expect(ref).toEqual({
      valid: true,
      shortCode: "hotel-room-9a1b",
      expenseSlug: "hotel-room",
      hashSuffix: "9a1b",
    });
  });

  it("validates group creation and participant split schemas with fieldErrorsFrom", () => {
    const invalidGroup = createGroupFormSchema.safeParse({
      name: "x",
      description: "   ",
    });
    expect(invalidGroup.success).toBe(false);
    expect(fieldErrorsFrom(invalidGroup)).toEqual({
      name: "Group name must be at least 2 characters",
    });

    const duplicateSplit = participantSplitSchema.safeParse([
      { userId: "u1", contact: "alice@example.com" },
      { userId: "U1", contact: "bob@example.com" },
    ]);
    expect(duplicateSplit.success).toBe(false);
    expect(fieldErrorsFrom(duplicateSplit)["1.userId"]).toBe(
      "A participant appears more than once"
    );
  });
});
