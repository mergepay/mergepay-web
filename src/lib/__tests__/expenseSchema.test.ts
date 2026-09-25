import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expenseFormSchema } from "../validations/expense";

// ---------------------------------------------------------------------------
// Fixtures — mirror the payload `AddExpenseDialog` builds before submitting.
// ---------------------------------------------------------------------------

const validEqual = {
  title: "Dinner at Terra Kulture",
  description: "Birthday dinner",
  amount: "150",
  assetCode: "XLM",
  assetIssuer: null,
  splitType: "equal" as const,
  shares: [
    { userId: "user-a" },
    { userId: "user-b" },
    { userId: "user-c" },
  ],
  payerUserId: "user-a",
  memo: "MP:dinner-1a2b",
  receiptUrl: null,
};

const validCustom = {
  ...validEqual,
  splitType: "custom" as const,
  shares: [
    { userId: "user-a", amount: "50" },
    { userId: "user-b", amount: "50" },
    { userId: "user-c", amount: "50" },
  ],
};

const validPercentage = {
  ...validEqual,
  splitType: "percentage" as const,
  shares: [
    { userId: "user-a", percent: 33.33 },
    { userId: "user-b", percent: 33.33 },
    { userId: "user-c", percent: 33.34 },
  ],
};

function parse(overrides: Record<string, unknown>) {
  return expenseFormSchema.safeParse({ ...validEqual, ...overrides });
}

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

// ---------------------------------------------------------------------------
// Valid payloads
// ---------------------------------------------------------------------------

describe("expenseFormSchema — valid submissions", () => {
  it("accepts a valid equal split", () => {
    assert.equal(expenseFormSchema.safeParse(validEqual).success, true);
  });

  it("accepts a valid custom split", () => {
    assert.equal(expenseFormSchema.safeParse(validCustom).success, true);
  });

  it("accepts a valid percentage split", () => {
    assert.equal(expenseFormSchema.safeParse(validPercentage).success, true);
  });

  it("accepts shares that only add up with exact decimal arithmetic", () => {
    // 0.1 + 0.2 + 0.3 is not 0.6 in binary floating point; stroops are exact.
    const result = expenseFormSchema.safeParse({
      ...validCustom,
      amount: "0.6",
      shares: [
        { userId: "user-a", amount: "0.1" },
        { userId: "user-b", amount: "0.2" },
        { userId: "user-c", amount: "0.3" },
      ],
    });
    assert.equal(result.success, true);
  });

  it("accepts the maximum supported precision", () => {
    assert.equal(parse({ amount: "1.1234567" }).success, true);
  });

  it("accepts a single participant", () => {
    assert.equal(parse({ shares: [{ userId: "user-a" }] }).success, true);
  });

  it("accepts an omitted memo, receiptUrl and payer (API-optional)", () => {
    const result = expenseFormSchema.safeParse({
      title: "Rent",
      amount: "500",
      assetCode: "USDC",
      splitType: "equal",
      shares: [{ userId: "user-a" }],
    });
    assert.equal(result.success, true);
  });
});

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

describe("expenseFormSchema — title", () => {
  it("requires a title", () => {
    assert.equal(firstMessage(parse({ title: "" })), "Title is required");
    assert.equal(firstMessage(parse({ title: "   " })), "Title is required");
  });

  it("caps the title length", () => {
    assert.match(
      firstMessage(parse({ title: "A".repeat(81) })) ?? "",
      /80 characters or fewer/
    );
    assert.equal(parse({ title: "A".repeat(80) }).success, true);
  });

  it("trims surrounding whitespace", () => {
    assert.equal(parse({ title: "  Dinner  " }).success, true);
  });
});

// ---------------------------------------------------------------------------
// Amount
// ---------------------------------------------------------------------------

describe("expenseFormSchema — amount", () => {
  it("requires an amount", () => {
    assert.equal(firstMessage(parse({ amount: "" })), "Amount is required");
  });

  it("rejects zero", () => {
    assert.equal(
      firstMessage(parse({ amount: "0" })),
      "Amount must be greater than zero"
    );
    assert.equal(
      firstMessage(parse({ amount: "0.0000000" })),
      "Amount must be greater than zero"
    );
  });

  it("rejects negative amounts", () => {
    assert.match(firstMessage(parse({ amount: "-5" })) ?? "", /plain number/);
  });

  it("rejects excessive precision", () => {
    assert.match(
      firstMessage(parse({ amount: "1.12345678" })) ?? "",
      /at most 7 decimal places/
    );
  });

  it("rejects non-numeric input that parseFloat would accept", () => {
    assert.match(firstMessage(parse({ amount: "abc" })) ?? "", /plain number/);
    assert.match(firstMessage(parse({ amount: "50abc" })) ?? "", /plain number/);
    assert.match(firstMessage(parse({ amount: "1e5" })) ?? "", /plain number/);
  });
});

// ---------------------------------------------------------------------------
// Asset & payer
// ---------------------------------------------------------------------------

describe("expenseFormSchema — asset and payer", () => {
  it("requires an asset code", () => {
    assert.equal(
      firstMessage(parse({ assetCode: "" })),
      "Asset code is required"
    );
  });

  it("requires a payer when one is provided empty", () => {
    assert.equal(firstMessage(parse({ payerUserId: "" })), "Choose who paid");
  });

  it("rejects an unknown split type", () => {
    assert.match(
      firstMessage(parse({ splitType: "shares" })) ?? "",
      /Choose how to split this expense/
    );
  });
});

// ---------------------------------------------------------------------------
// Participants / shares
// ---------------------------------------------------------------------------

describe("expenseFormSchema — shares", () => {
  it("rejects an empty split", () => {
    assert.equal(
      firstMessage(parse({ shares: [] })),
      "Select at least one participant"
    );
  });

  it("rejects a participant with a blank user id", () => {
    assert.equal(
      firstMessage(parse({ shares: [{ userId: "  " }] })),
      "Participant is required"
    );
  });

  it("rejects an equal split too small to give everyone a stroop", () => {
    // 2 stroops cannot be split across 3 people without zeroing someone.
    assert.match(
      firstMessage(parse({ amount: "0.0000002" })) ?? "",
      /too small to split between 3 people/
    );
  });
});

describe("expenseFormSchema — custom split", () => {
  function custom(shares: Record<string, string>) {
    return expenseFormSchema.safeParse({
      ...validCustom,
      shares: Object.entries(shares).map(([userId, amount]) => ({
        userId,
        amount,
      })),
    });
  }

  it("accepts shares that total the amount exactly", () => {
    assert.equal(
      custom({ "user-a": "50", "user-b": "50", "user-c": "50" }).success,
      true
    );
  });

  it("reports how far over the shares are", () => {
    const result = custom({ "user-a": "50", "user-b": "50", "user-c": "51" });
    assert.equal(result.success, false);
    assert.match(
      result.error?.issues[0]?.message ?? "",
      /over by 1 .* must add up to 150/
    );
  });

  it("reports how far short the shares are, down to a stroop", () => {
    const result = custom({
      "user-a": "50",
      "user-b": "50",
      "user-c": "49.9999999",
    });
    assert.equal(result.success, false);
    assert.match(
      result.error?.issues[0]?.message ?? "",
      /short by 0\.0000001/
    );
  });

  it("rejects a missing share rather than treating it as zero", () => {
    const result = custom({ "user-a": "150", "user-b": "" });
    assert.equal(result.success, false);
    assert.equal(
      result.error?.issues[0]?.message,
      "Enter an amount for every participant"
    );
  });

  it("rejects a zero share", () => {
    const result = custom({ "user-a": "150", "user-b": "0", "user-c": "0" });
    assert.equal(result.success, false);
    assert.match(
      result.error?.issues[0]?.message ?? "",
      /greater than zero/
    );
  });

  it("rejects a negative share", () => {
    const result = custom({ "user-a": "160", "user-b": "-5", "user-c": "-5" });
    assert.equal(result.success, false);
    assert.match(result.error?.issues[0]?.message ?? "", /plain number/);
  });

  it("rejects a share with excessive precision", () => {
    const result = custom({
      "user-a": "50.12345678",
      "user-b": "50",
      "user-c": "49.87654322",
    });
    assert.equal(result.success, false);
    assert.match(
      result.error?.issues[0]?.message ?? "",
      /at most 7 decimal places/
    );
  });
});

describe("expenseFormSchema — percentage split", () => {
  function percent(shares: Record<string, number>) {
    return expenseFormSchema.safeParse({
      ...validPercentage,
      shares: Object.entries(shares).map(([userId, pct]) => ({
        userId,
        percent: pct,
      })),
    });
  }

  it("accepts percentages that total exactly 100", () => {
    assert.equal(
      percent({ "user-a": 50, "user-b": 25, "user-c": 25 }).success,
      true
    );
    assert.equal(
      percent({ "user-a": 33.33, "user-b": 33.33, "user-c": 33.34 }).success,
      true
    );
  });

  it("rejects percentages that do not total 100 and shows the running total", () => {
    const result = percent({ "user-a": 30, "user-b": 30, "user-c": 30 });
    assert.equal(result.success, false);
    assert.match(
      result.error?.issues[0]?.message ?? "",
      /add up to 90% — they must add up to 100%/
    );
  });

  it("rejects a total that is off by a hundredth", () => {
    const result = percent({ "user-a": 33.33, "user-b": 33.33, "user-c": 33.33 });
    assert.equal(result.success, false);
  });

  it("rejects a missing percentage", () => {
    const result = expenseFormSchema.safeParse({
      ...validPercentage,
      shares: [
        { userId: "user-a", percent: 100 },
        { userId: "user-b" },
      ],
    });
    assert.equal(result.success, false);
    assert.equal(
      result.error?.issues[0]?.message,
      "Enter a percentage for every participant"
    );
  });

  it("rejects percentages with excessive precision", () => {
    const result = percent({ "user-a": 33.333, "user-b": 33.333, "user-c": 33.334 });
    assert.equal(result.success, false);
    assert.match(
      result.error?.issues[0]?.message ?? "",
      /at most 2 decimal places/
    );
  });
});

// ---------------------------------------------------------------------------
// Memo
// ---------------------------------------------------------------------------

describe("expenseFormSchema — memo", () => {
  it("caps the memo length at 28 characters", () => {
    assert.equal(parse({ memo: "A".repeat(29) }).success, false);
    assert.equal(parse({ memo: "A".repeat(28) }).success, true);
  });

  it("rejects control characters", () => {
    assert.equal(parse({ memo: "bad\u0000memo" }).success, false);
    assert.equal(parse({ memo: "bad\u001fmemo" }).success, false);
  });
});

// ---------------------------------------------------------------------------
// Field errors land on the right paths (for inline display / toasts)
// ---------------------------------------------------------------------------

describe("expenseFormSchema — issue paths", () => {
  it("reports a bad amount on the amount path", () => {
    const result = parse({ amount: "0" });
    assert.equal(result.success, false);
    assert.equal(result.error?.issues[0]?.path[0], "amount");
  });

  it("reports split-sum problems on the shares path", () => {
    const result = parse({
      ...validCustom,
      shares: [
        { userId: "user-a", amount: "100" },
        { userId: "user-b", amount: "50" },
        { userId: "user-c", amount: "50" },
      ],
    });
    assert.equal(result.success, false);
    assert.equal(result.error?.issues[0]?.path[0], "shares");
  });
});
