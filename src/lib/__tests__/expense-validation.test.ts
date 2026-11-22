import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SETTLEMENT_ASSETS } from "../constants";
import { expenseCreationSchema } from "../validation";
import { createExpenseFormSchema, expenseFormSchema } from "../validations/expense";

const memberIds = ["user-a", "user-b"];
const validExpense = {
  title: "Dinner",
  amount: "12.5",
  assetCode: "XLM",
  assetIssuer: null,
  splitType: "equal",
  shares: [{ userId: "user-a" }, { userId: "user-b" }],
  payerUserId: "user-a",
};

const groupExpenseSchema = createExpenseFormSchema({
  memberIds,
  supportedAssets: SETTLEMENT_ASSETS,
});

function parse(overrides: Record<string, unknown> = {}) {
  return groupExpenseSchema.safeParse({ ...validExpense, ...overrides });
}

function issueAt(result: ReturnType<typeof parse>, path: string) {
  assert.equal(result.success, false);
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path.join(".") === path);
}

describe("expense creation validation contract", () => {
  it("trims title and description and produces a payload accepted by the API schema", () => {
    const result = parse({ title: "  Dinner  ", description: "  Group meal  " });

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.data.title, "Dinner");
    assert.equal(result.data.description, "Group meal");
    assert.equal(expenseCreationSchema.safeParse(result.data).success, true);
  });

  it("keeps description optional when it is omitted", () => {
    const result = parse();

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.description, undefined);
      assert.equal(expenseCreationSchema.safeParse(result.data).success, true);
    }
  });

  it("rejects whitespace-only descriptions on the description path", () => {
    const result = parse({ description: "   \t  " });
    const issue = issueAt(result, "description");

    assert.equal(issue?.message, "Description cannot be empty");
  });

  it("rejects null descriptions because the API contract only allows an optional string", () => {
    const result = parse({ description: null });

    assert.equal(issueAt(result, "description")?.code, "invalid_type");
  });

  it("accepts the 500-character description limit and rejects longer values", () => {
    assert.equal(parse({ description: "x".repeat(500) }).success, true);
    assert.equal(issueAt(parse({ description: "x".repeat(501) }), "description")?.message,
      "Description must be 500 characters or fewer");
  });

  it("accepts equal splits without irrelevant share fields", () => {
    assert.equal(parse().success, true);
  });

  it("requires exact amounts only for custom splits and checks their total exactly", () => {
    const valid = parse({
      amount: "0.3",
      splitType: "custom",
      shares: [
        { userId: "user-a", amount: "0.1" },
        { userId: "user-b", amount: "0.2" },
      ],
    });
    const invalid = parse({
      splitType: "custom",
      shares: [
        { userId: "user-a", amount: "6" },
        { userId: "user-b" },
      ],
    });

    assert.equal(valid.success, true);
    assert.match(issueAt(invalid, "shares.1.amount")?.message ?? "", /amount for every participant/i);
  });

  it("requires percentages only for percentage splits and totals basis points exactly", () => {
    const valid = parse({
      splitType: "percentage",
      shares: [
        { userId: "user-a", percent: 33.33 },
        { userId: "user-b", percent: 66.67 },
      ],
    });
    const invalid = parse({
      splitType: "percentage",
      shares: [
        { userId: "user-a", percent: 33.33 },
        { userId: "user-b", percent: 66.66 },
      ],
    });

    assert.equal(valid.success, true);
    assert.match(issueAt(invalid, "shares")?.message ?? "", /must add up to 100%/i);
  });

  it("rejects empty, duplicate, and non-member participant selections", () => {
    assert.equal(parse({ shares: [] }).success, false);
    assert.match(issueAt(parse({ shares: [{ userId: "user-a" }, { userId: "user-a" }] }), "shares")?.message ?? "", /more than once/i);
    assert.match(issueAt(parse({ shares: [{ userId: "outsider" }] }), "shares.0.userId")?.message ?? "", /not a member/i);
  });

  it("validates currency against the application's supported asset identity", () => {
    const usdc = SETTLEMENT_ASSETS.find((asset) => asset.code === "USDC");
    assert.ok(usdc, "USDC is configured as a settlement asset");
    assert.equal(parse({ assetCode: usdc.code, assetIssuer: usdc.issuer }).success, true);
    assert.equal(parse({ assetCode: "USDC", assetIssuer: null }).success, usdc.issuer === null);
    assert.equal(parse({ assetCode: "EUR" }).success, false);
  });

  it("keeps malformed monetary input and unsupported precision off the payload path", () => {
    for (const amount of ["", "0", "-1", "1e3", "1.00000001", "Infinity"]) {
      assert.equal(expenseFormSchema.safeParse({ ...validExpense, amount }).success, false, amount);
    }
    assert.equal(parse({ amount: "922337203685.4775808" }).success, false);
  });
});
