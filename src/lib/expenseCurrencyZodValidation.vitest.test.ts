import { describe, expect, it } from "vitest";
import { expenseSplitSchema, MAX_TITLE_LENGTH } from "./expenseValidation";

describe("Expense creation and currency precision validation (#607)", () => {
  it("accepts up to 7 Stellar decimal places and rejects >7 decimals", () => {
    expect(MAX_TITLE_LENGTH).toBe(80);
    expect(
      expenseSplitSchema.safeParse({
        amount: "15.1234567",
        splitType: "equal",
        shares: [{ userId: "u1" }],
      }).success
    ).toBe(true);

    expect(
      expenseSplitSchema.safeParse({
        amount: "15.12345678",
        splitType: "equal",
        shares: [{ userId: "u1" }],
      }).success
    ).toBe(false);
  });
});
