import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stellarPublicKeySchema,
  createGroupSchema,
  createExpenseSchema,
  settleBalanceSchema,
} from "../validation";

describe("Client-side Zod Validation Schemas (#284)", () => {
  it("validates Stellar Ed25519 public keys starting with G", () => {
    const validKey = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
    assert.equal(stellarPublicKeySchema.safeParse(validKey).success, true);

    // Invalid prefix
    assert.equal(stellarPublicKeySchema.safeParse("SBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H").success, false);
    // Invalid length
    assert.equal(stellarPublicKeySchema.safeParse("GSHORT").success, false);
  });

  it("validates group creation inputs", () => {
    const valid = createGroupSchema.safeParse({
      name: "Trip to Tokyo",
      currency: "USDC",
      initialMembers: ["user-1", "user-2"],
    });
    assert.equal(valid.success, true);

    const invalidName = createGroupSchema.safeParse({
      name: "A", // too short
      currency: "USDC",
    });
    assert.equal(invalidName.success, false);
  });

  it("validates expense form fields and custom split sum checks", () => {
    const validEqual = createExpenseSchema.safeParse({
      title: "Dinner",
      amount: "50.00",
      assetCode: "USDC",
      payerUserId: "u1",
      splitType: "equal",
      shares: [{ userId: "u1" }, { userId: "u2" }],
    });
    assert.equal(validEqual.success, true);

    // Invalid split percentage sum != 100
    const invalidPercent = createExpenseSchema.safeParse({
      title: "Hotel",
      amount: "100.00",
      assetCode: "USDC",
      payerUserId: "u1",
      splitType: "percentage",
      shares: [
        { userId: "u1", percent: 50 },
        { userId: "u2", percent: 30 }, // total 80 != 100
      ],
    });
    assert.equal(invalidPercent.success, false);

    // Invalid custom split sum != total
    const invalidCustom = createExpenseSchema.safeParse({
      title: "Groceries",
      amount: "40.00",
      assetCode: "USDC",
      payerUserId: "u1",
      splitType: "custom",
      shares: [
        { userId: "u1", amount: "10.00" },
        { userId: "u2", amount: "20.00" }, // total 30 != 40
      ],
    });
    assert.equal(invalidCustom.success, false);
  });

  it("validates settlement form inputs", () => {
    const valid = settleBalanceSchema.safeParse({
      recipientId: "user-2",
      amount: "25.50",
      assetCode: "XLM",
    });
    assert.equal(valid.success, true);

    const invalidAmount = settleBalanceSchema.safeParse({
      recipientId: "user-2",
      amount: "-10.00", // negative amount
      assetCode: "XLM",
    });
    assert.equal(invalidAmount.success, false);
  });
});
