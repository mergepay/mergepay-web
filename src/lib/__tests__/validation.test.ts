import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import type { CreateExpenseRequest } from "../types";
import {
  stellarPublicKeySchema,
  createGroupSchema,
  createExpenseSchema,
  expenseCreationSchema,
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

// ---------------------------------------------------------------------------
// Expense creation payload schema (#315)
// ---------------------------------------------------------------------------

/** Mirrors the payload `AddExpenseDialog` builds before dispatch. */
const validPayload = {
  title: "Dinner at Terra Kulture",
  description: "Birthday dinner",
  amount: "150",
  assetCode: "XLM",
  assetIssuer: null,
  splitType: "equal",
  shares: [
    { userId: "user-a" },
    { userId: "user-b" },
    { userId: "user-c" },
  ],
  payerUserId: "user-a",
  memo: "MP:dinner-1a2b",
  receiptUrl: null,
};

/** Collect every issue message so assertions can match any of them. */
function issueMessages(result: {
  success: false;
  error: z.ZodError;
}): string {
  return result.error.issues.map((issue) => issue.message).join(" | ");
}

describe("expenseCreationSchema (#315)", () => {
  it("accepts well-formed payloads for every split type", () => {
    const equal = expenseCreationSchema.parse(validPayload);
    assert.equal(equal.amount, "150");
    assert.equal(equal.description, "Birthday dinner");

    const custom = expenseCreationSchema.parse({
      ...validPayload,
      splitType: "custom",
      shares: [
        { userId: "user-a", amount: "50" },
        { userId: "user-b", amount: "50.5" },
        { userId: "user-c", amount: "49.5" },
      ],
    });
    assert.equal(custom.splitType, "custom");

    const percentage = expenseCreationSchema.parse({
      ...validPayload,
      splitType: "percentage",
      shares: [
        { userId: "user-a", percent: 33.33 },
        { userId: "user-b", percent: 33.33 },
        { userId: "user-c", percent: 33.34 },
      ],
    });
    assert.equal(percentage.splitType, "percentage");
  });

  it("requires a non-empty title", () => {
    const result = expenseCreationSchema.safeParse({ ...validPayload, title: "   " });
    assert.equal(result.success, false);
    if (!result.success) assert.match(issueMessages(result), /Title is required/);
  });

  it("requires a non-empty description when one is provided", () => {
    const missing = expenseCreationSchema.parse({ ...validPayload, description: undefined });
    assert.equal(missing.description, undefined);

    const trimmed = expenseCreationSchema.parse({
      ...validPayload,
      description: "  Grocery run  ",
    });
    assert.equal(trimmed.description, "Grocery run");

    for (const description of ["", "   "]) {
      const result = expenseCreationSchema.safeParse({ ...validPayload, description });
      assert.equal(result.success, false, `description ${JSON.stringify(description)} must be rejected`);
      if (!result.success) assert.match(issueMessages(result), /Description cannot be empty/);
    }
  });

  it("accepts Stellar-precision amounts and normalizes number inputs", () => {
    // One stroop (7 decimal places) is the smallest representable amount.
    const stroop = expenseCreationSchema.parse({
      ...validPayload,
      amount: "0.0000001",
      splitType: "custom",
      shares: [{ userId: "user-a", amount: "0.0000001" }],
    });
    assert.equal(stroop.amount, "0.0000001");

    const numberInput = expenseCreationSchema.parse({ ...validPayload, amount: 42.5 });
    assert.equal(numberInput.amount, "42.5");
  });

  it("rejects malformed amounts with descriptive errors", () => {
    const cases: Array<[unknown, RegExp]> = [
      ["", /Amount is required/],
      ["0", /greater than zero/],
      ["-5", /positive decimal number/],
      ["1.12345678", /at most 7 decimal places/],
      ["abc", /positive decimal number/],
      [0, /greater than zero/],
      [1.12345678, /at most 7 decimal places/],
      [Number.NaN, /finite number/],
      [Number.POSITIVE_INFINITY, /finite number/],
    ];

    for (const [amount, expected] of cases) {
      const result = expenseCreationSchema.safeParse({ ...validPayload, amount });
      assert.equal(result.success, false, `amount ${String(amount)} must be rejected`);
      if (!result.success) assert.match(issueMessages(result), expected);
    }
  });

  it("validates currency as a 3-12 character asset code or an asset contract ID", () => {
    for (const assetCode of ["XLM", "USDC", "A1B2C3"]) {
      const result = expenseCreationSchema.safeParse({ ...validPayload, assetCode });
      assert.equal(result.success, true, `${assetCode} must be accepted`);
    }

    // Soroban contract IDs: strkey form and raw hex form.
    const contractIds = [`C${"A".repeat(55)}`, `0x${"abcdef0123456789".repeat(4)}`];
    for (const assetCode of contractIds) {
      const result = expenseCreationSchema.safeParse({ ...validPayload, assetCode });
      assert.equal(result.success, true, `contract ID ${assetCode.slice(0, 12)}… must be accepted`);
    }

    for (const assetCode of ["AB", "ABCD123456789012", "US DC", "US$D"]) {
      const result = expenseCreationSchema.safeParse({ ...validPayload, assetCode });
      assert.equal(result.success, false, `${assetCode} must be rejected`);
      if (!result.success) assert.match(issueMessages(result), /3-12 character asset code/);
    }

    const empty = expenseCreationSchema.safeParse({ ...validPayload, assetCode: "" });
    assert.equal(empty.success, false);
    if (!empty.success) assert.match(issueMessages(empty), /Currency \/ asset code is required/);
  });

  it("validates the asset issuer as a Stellar public key when present", () => {
    const issuer = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
    const valid = expenseCreationSchema.parse({ ...validPayload, assetIssuer: issuer });
    assert.equal(valid.assetIssuer, issuer);

    const bad = expenseCreationSchema.safeParse({ ...validPayload, assetIssuer: "not-a-key" });
    assert.equal(bad.success, false);
    if (!bad.success) assert.match(issueMessages(bad), /valid Stellar public key/);
  });

  it("requires custom shares to sum to the total exactly, without float drift", () => {
    // 0.1 + 0.2 !== 0.3 in floating point — as integer stroops the sum is exact.
    const exact = expenseCreationSchema.parse({
      ...validPayload,
      amount: "0.3",
      splitType: "custom",
      shares: [
        { userId: "user-a", amount: "0.1" },
        { userId: "user-b", amount: "0.2" },
      ],
    });
    assert.equal(exact.amount, "0.3");

    const short = expenseCreationSchema.safeParse({
      ...validPayload,
      amount: "40",
      splitType: "custom",
      shares: [
        { userId: "user-a", amount: "10" },
        { userId: "user-b", amount: "20" },
      ],
    });
    assert.equal(short.success, false);
    if (!short.success) {
      assert.match(issueMessages(short), /short by 10/);
      assert.match(issueMessages(short), /must add up to 40/);
    }

    const over = expenseCreationSchema.safeParse({
      ...validPayload,
      amount: "40",
      splitType: "custom",
      shares: [
        { userId: "user-a", amount: "30" },
        { userId: "user-b", amount: "20" },
      ],
    });
    assert.equal(over.success, false);
    if (!over.success) assert.match(issueMessages(over), /over by 10/);
  });

  it("describes each malformed custom share individually", () => {
    const base = { ...validPayload, amount: "150", splitType: "custom" } as const;

    const missing = expenseCreationSchema.safeParse({
      ...base,
      shares: [{ userId: "user-a", amount: "50" }, { userId: "user-b" }],
    });
    assert.equal(missing.success, false);
    if (!missing.success) assert.match(issueMessages(missing), /Enter an amount for every participant/);

    const zero = expenseCreationSchema.safeParse({
      ...base,
      shares: [{ userId: "user-a", amount: "0" }, { userId: "user-b", amount: "150" }],
    });
    assert.equal(zero.success, false);
    if (!zero.success) assert.match(issueMessages(zero), /greater than zero/);

    const tooPrecise = expenseCreationSchema.safeParse({
      ...base,
      shares: [
        { userId: "user-a", amount: "0.00000001" },
        { userId: "user-b", amount: "150" },
      ],
    });
    assert.equal(tooPrecise.success, false);
    if (!tooPrecise.success) assert.match(issueMessages(tooPrecise), /at most 7 decimal places/);

    const notPlain = expenseCreationSchema.safeParse({
      ...base,
      shares: [{ userId: "user-a", amount: "abc" }, { userId: "user-b", amount: "150" }],
    });
    assert.equal(notPlain.success, false);
    if (!notPlain.success) assert.match(issueMessages(notPlain), /plain number/);
  });

  it("requires percentages to total exactly 100%", () => {
    const split = (shares: Array<{ userId: string; percent?: number }>) =>
      expenseCreationSchema.safeParse({ ...validPayload, splitType: "percentage", shares });

    const balanced = split([
      { userId: "user-a", percent: 50 },
      { userId: "user-b", percent: 50 },
    ]);
    assert.equal(balanced.success, true);

    const off = split([
      { userId: "user-a", percent: 50 },
      { userId: "user-b", percent: 30 },
    ]);
    assert.equal(off.success, false);
    if (!off.success) {
      assert.match(issueMessages(off), /add up to 80%/);
      assert.match(issueMessages(off), /must add up to 100%/);
    }

    const tooPrecise = split([{ userId: "user-a", percent: 33.333 }, { userId: "user-b", percent: 66.667 }]);
    assert.equal(tooPrecise.success, false);
    if (!tooPrecise.success) assert.match(issueMessages(tooPrecise), /at most 2 decimal places/);

    const outOfRange = split([{ userId: "user-a", percent: 101 }, { userId: "user-b", percent: 0 }]);
    assert.equal(outOfRange.success, false);
    if (!outOfRange.success) assert.match(issueMessages(outOfRange), /between 0 and 100/);

    const missing = split([{ userId: "user-a" }, { userId: "user-b", percent: 50 }]);
    assert.equal(missing.success, false);
    if (!missing.success) assert.match(issueMessages(missing), /Enter a percentage for every participant/);
  });

  it("rejects duplicate participants and equal splits too small to divide", () => {
    const duplicate = expenseCreationSchema.safeParse({
      ...validPayload,
      shares: [{ userId: "user-a" }, { userId: "user-a" }],
    });
    assert.equal(duplicate.success, false);
    if (!duplicate.success) assert.match(issueMessages(duplicate), /selected more than once/);

    // 0.0000002 = 2 stroops — not enough for 3 participants to each get one.
    const tooSmall = expenseCreationSchema.safeParse({ ...validPayload, amount: "0.0000002" });
    assert.equal(tooSmall.success, false);
    if (!tooSmall.success) assert.match(issueMessages(tooSmall), /too small to split between 3 people/);

    const noShares = expenseCreationSchema.safeParse({ ...validPayload, shares: [] });
    assert.equal(noShares.success, false);
    if (!noShares.success) assert.match(issueMessages(noShares), /At least one participating member/);
  });

  it("reports issues instead of throwing on structurally wrong payloads", () => {
    assert.equal(expenseCreationSchema.safeParse({}).success, false);
    assert.equal(expenseCreationSchema.safeParse(null).success, false);
    assert.equal(
      expenseCreationSchema.safeParse({ ...validPayload, shares: "not-an-array" }).success,
      false
    );
    assert.equal(
      expenseCreationSchema.safeParse({ ...validPayload, shares: undefined }).success,
      false
    );
  });

  it("throws a descriptive ZodError from parse() on invalid payloads", () => {
    assert.throws(
      () => expenseCreationSchema.parse({ ...validPayload, amount: "-1" }),
      (error: unknown) =>
        error instanceof z.ZodError && /positive decimal number/.test(error.issues[0]?.message ?? "")
    );
  });

  it("infers payloads assignable to CreateExpenseRequest (z.infer ↔ types.ts)", () => {
    // Compile-time proof: if ExpenseCreationInput drifts from the API
    // contract in src/lib/types.ts, this assignment fails typechecking.
    const request: CreateExpenseRequest = expenseCreationSchema.parse({
      ...validPayload,
      splitType: "custom",
      shares: [
        { userId: "user-a", amount: "75" },
        { userId: "user-b", amount: "75" },
      ],
    });
    assert.equal(request.amount, "150");
    assert.equal(request.splitType, "custom");
    assert.equal(request.shares.length, 2);
  });
});
