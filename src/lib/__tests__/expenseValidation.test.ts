import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  expenseSplitSchema,
  AMOUNT_DECIMAL_PLACES,
  formatAmountUnits,
  formatDecimalUnits,
  parseDecimalUnits,
  splitEqualUnits,
  validateExpenseForm,
  type ExpenseFormContext,
  type ExpenseFormInput,
} from "../expenseValidation";

describe("expenseSplitSchema", () => {
  it("requires exact custom totals and decimal-7 precision", () => {
    assert.equal(expenseSplitSchema.safeParse({ amount: "10", splitType: "custom", shares: [{ userId: "a", amount: "5" }, { userId: "b", amount: "5" }] }).success, true);
    assert.equal(expenseSplitSchema.safeParse({ amount: "10", splitType: "custom", shares: [{ userId: "a", amount: "5.00000001" }, { userId: "b", amount: "5" }] }).success, false);
  });
  it("requires percentages to total exactly 100", () => {
    assert.equal(expenseSplitSchema.safeParse({ amount: "10", splitType: "percentage", shares: [{ userId: "a", percent: 50 }, { userId: "b", percent: 50 }] }).success, true);
    assert.equal(expenseSplitSchema.safeParse({ amount: "10", splitType: "percentage", shares: [{ userId: "a", percent: 60 }, { userId: "b", percent: 30 }] }).success, false);
  });
});

const MEMBERS = ["user-a", "user-b", "user-c"];

const context: ExpenseFormContext = {
  memberIds: MEMBERS,
  supportedAssetCodes: ["XLM", "USDC"],
};

const validEqual: ExpenseFormInput = {
  title: "Dinner at Terra Kulture",
  amount: "150.00",
  assetCode: "XLM",
  splitType: "equal",
  payerUserId: "user-a",
  participants: [...MEMBERS],
  custom: {},
  percent: {},
};

const validCustom: ExpenseFormInput = {
  ...validEqual,
  splitType: "custom",
  custom: { "user-a": "50.00", "user-b": "50.00", "user-c": "50.00" },
};

const validPercent: ExpenseFormInput = {
  ...validEqual,
  splitType: "percentage",
  percent: { "user-a": "33.33", "user-b": "33.33", "user-c": "33.34" },
};

function validate(overrides: Partial<ExpenseFormInput>) {
  return validateExpenseForm({ ...validEqual, ...overrides }, context);
}

// ---------------------------------------------------------------------------
// Decimal primitives
// ---------------------------------------------------------------------------

describe("parseDecimalUnits", () => {
  it("scales plain decimals to integer units", () => {
    assert.equal(parseDecimalUnits("1", 7), 10_000_000n);
    assert.equal(parseDecimalUnits("1.5", 7), 15_000_000n);
    assert.equal(parseDecimalUnits("0.0000001", 7), 1n);
    assert.equal(parseDecimalUnits("0", 7), 0n);
  });

  it("accepts a trailing or leading dot", () => {
    assert.equal(parseDecimalUnits("50.", 7), 500_000_000n);
    assert.equal(parseDecimalUnits(".5", 7), 5_000_000n);
  });

  it("reports excess precision separately from bad input", () => {
    assert.equal(parseDecimalUnits("1.12345678", 7), "too_precise");
    assert.equal(parseDecimalUnits("1.234", 2), "too_precise");
  });

  it("rejects everything parseFloat would silently accept", () => {
    assert.equal(parseDecimalUnits("abc", 7), null);
    assert.equal(parseDecimalUnits("50abc", 7), null);
    assert.equal(parseDecimalUnits("1e5", 7), null);
    assert.equal(parseDecimalUnits("-5", 7), null);
    assert.equal(parseDecimalUnits("+5", 7), null);
    assert.equal(parseDecimalUnits("1.2.3", 7), null);
    assert.equal(parseDecimalUnits("", 7), null);
    assert.equal(parseDecimalUnits("   ", 7), null);
  });

  it("is exact where floating point is not", () => {
    // 0.1 + 0.2 !== 0.3 as doubles; as integer units it is exact.
    const sum =
      (parseDecimalUnits("0.1", 7) as bigint) +
      (parseDecimalUnits("0.2", 7) as bigint);
    assert.equal(sum, parseDecimalUnits("0.3", 7));
  });

  it("keeps precision on values too large for a double", () => {
    assert.equal(
      parseDecimalUnits("9007199254740993.0000001", 7),
      90071992547409930000001n
    );
  });
});

describe("formatDecimalUnits", () => {
  it("round-trips through parseDecimalUnits", () => {
    for (const raw of ["1", "1.5", "0.0000001", "150", "33.33"]) {
      const units = parseDecimalUnits(raw, AMOUNT_DECIMAL_PLACES) as bigint;
      assert.equal(
        parseDecimalUnits(formatAmountUnits(units), AMOUNT_DECIMAL_PLACES),
        units,
        raw
      );
    }
  });

  it("trims trailing zeros but keeps the integer part", () => {
    assert.equal(formatAmountUnits(10_000_000n), "1");
    assert.equal(formatAmountUnits(15_000_000n), "1.5");
    assert.equal(formatAmountUnits(1n), "0.0000001");
    assert.equal(formatDecimalUnits(10_000n, 2), "100");
  });
});

describe("splitEqualUnits", () => {
  it("divides evenly when it can", () => {
    assert.deepEqual(splitEqualUnits(90n, 3), [30n, 30n, 30n]);
  });

  it("distributes the remainder instead of rounding it away", () => {
    const shares = splitEqualUnits(100n, 3);
    assert.deepEqual(shares, [34n, 33n, 33n]);
    assert.equal(
      shares.reduce((a, b) => a + b, 0n),
      100n
    );
  });

  it("always sums back to the total", () => {
    for (const [total, count] of [
      [10_000_000n, 3],
      [1n, 1],
      [7n, 5],
      [123_456_789n, 7],
    ] as const) {
      assert.equal(
        splitEqualUnits(total, count).reduce((a, b) => a + b, 0n),
        total
      );
    }
  });

  it("returns nothing for a non-positive participant count", () => {
    assert.deepEqual(splitEqualUnits(100n, 0), []);
  });
});

// ---------------------------------------------------------------------------
// Form validation
// ---------------------------------------------------------------------------

describe("validateExpenseForm — valid submissions", () => {
  it("accepts a small valid equal split", () => {
    assert.equal(validate({ amount: "3" }), null);
  });

  it("accepts a valid equal split", () => {
    assert.equal(validateExpenseForm(validEqual, context), null);
  });

  it("accepts a valid custom split", () => {
    assert.equal(validateExpenseForm(validCustom, context), null);
  });

  it("accepts a valid percentage split", () => {
    assert.equal(validateExpenseForm(validPercent, context), null);
  });
});

describe("title", () => {
  it("requires a title", () => {
    assert.equal(validate({ title: "" })?.title, "Title is required");
    assert.equal(validate({ title: "   " })?.title, "Title is required");
  });

  it("caps the title length", () => {
    assert.match(
      validate({ title: "A".repeat(81) })?.title ?? "",
      /80 characters or fewer/
    );
    assert.equal(validate({ title: "A".repeat(80) }), null);
  });
});

describe("amount", () => {
  it("requires an amount", () => {
    assert.equal(validate({ amount: "" })?.amount, "Amount is required");
  });

  it("rejects zero", () => {
    assert.equal(
      validate({ amount: "0" })?.amount,
      "Amount must be greater than zero"
    );
    assert.equal(
      validate({ amount: "0.0000000" })?.amount,
      "Amount must be greater than zero"
    );
  });

  it("rejects negative amounts", () => {
    // "-5" is not plain positive decimal notation at all.
    assert.match(validate({ amount: "-5" })?.amount ?? "", /plain number/);
  });

  it("rejects excessive precision", () => {
    assert.match(
      validate({ amount: "1.12345678" })?.amount ?? "",
      /at most 7 decimal places/
    );
  });

  it("accepts the maximum supported precision", () => {
    assert.equal(validate({ amount: "1.1234567" }), null);
  });

  it("rejects non-numeric input that parseFloat would accept", () => {
    assert.match(validate({ amount: "abc" })?.amount ?? "", /plain number/);
    assert.match(validate({ amount: "50abc" })?.amount ?? "", /plain number/);
    assert.match(validate({ amount: "1e5" })?.amount ?? "", /plain number/);
  });

  it("rejects an equal split too small to give everyone a stroop", () => {
    // 2 stroops cannot be split across 3 people without zeroing someone.
    assert.match(
      validate({ amount: "0.0000002" })?.amount ?? "",
      /too small to split between 3 people/
    );
  });

  it("accepts the smallest amount that can still be split", () => {
    assert.equal(validate({ amount: "0.0000003" }), null);
  });
});

describe("currency", () => {
  it("accepts each supported asset code", () => {
    for (const assetCode of context.supportedAssetCodes) {
      assert.equal(validate({ assetCode }), null, assetCode);
    }
  });

  it("rejects an unsupported currency", () => {
    assert.equal(
      validate({ assetCode: "BTC" })?.assetCode,
      "Choose one of the supported assets"
    );
    assert.equal(
      validate({ assetCode: "" })?.assetCode,
      "Choose one of the supported assets"
    );
  });

  it("is case-sensitive, matching the API's asset codes", () => {
    assert.ok(validate({ assetCode: "xlm" })?.assetCode);
  });
});

describe("payer", () => {
  it("requires a payer", () => {
    assert.equal(validate({ payerUserId: "" })?.payer, "Choose who paid");
  });

  it("rejects a payer who is not a group member", () => {
    assert.equal(
      validate({ payerUserId: "stranger" })?.payer,
      "The selected payer is not a member of this group"
    );
  });

  it("allows the payer to also be a participant", () => {
    assert.equal(
      validate({ payerUserId: "user-a", participants: ["user-a", "user-b"] }),
      null
    );
  });
});

describe("participants", () => {
  it("rejects an empty split", () => {
    assert.equal(
      validate({ participants: [] })?.participants,
      "Select at least one participant"
    );
  });

  it("accepts a single participant", () => {
    assert.equal(validate({ participants: ["user-a"] }), null);
  });

  it("rejects a participant who is not a group member", () => {
    assert.match(
      validate({ participants: ["user-a", "ghost"] })?.participants ?? "",
      /not a member of this group/
    );
  });

  it("rejects a duplicated participant", () => {
    assert.match(
      validate({ participants: ["user-a", "user-a"] })?.participants ?? "",
      /more than once/
    );
  });
});

describe("custom split", () => {
  function custom(shares: Record<string, string>) {
    return validateExpenseForm({ ...validCustom, custom: shares }, context);
  }

  it("accepts shares that total the amount exactly", () => {
    assert.equal(
      custom({ "user-a": "50", "user-b": "50", "user-c": "50" }),
      null
    );
  });

  it("accepts shares that only add up with exact decimal arithmetic", () => {
    // 0.1 + 0.2 + 0.3 is not 0.6 in binary floating point.
    assert.equal(
      validateExpenseForm(
        {
          ...validCustom,
          amount: "0.6",
          custom: { "user-a": "0.1", "user-b": "0.2", "user-c": "0.3" },
        },
        context
      ),
      null
    );
  });

  it("reports how far over the shares are", () => {
    assert.match(
      custom({ "user-a": "50", "user-b": "50", "user-c": "51" })?.custom ?? "",
      /over by 1 .* must add up to 150/
    );
  });

  it("reports how far short the shares are, down to a stroop", () => {
    assert.match(
      custom({ "user-a": "50", "user-b": "50", "user-c": "49.9999999" })
        ?.custom ?? "",
      /short by 0\.0000001/
    );
  });

  it("rejects a missing share rather than treating it as zero", () => {
    assert.equal(
      custom({ "user-a": "150", "user-b": "" })?.custom,
      "Enter an amount for every participant"
    );
  });

  it("rejects a zero share", () => {
    assert.match(
      custom({ "user-a": "150", "user-b": "0", "user-c": "0" })?.custom ?? "",
      /greater than zero/
    );
  });

  it("rejects a negative share", () => {
    assert.match(
      custom({ "user-a": "160", "user-b": "-5", "user-c": "-5" })?.custom ?? "",
      /plain number/
    );
  });

  it("rejects a share with excessive precision", () => {
    assert.match(
      custom({
        "user-a": "50.12345678",
        "user-b": "50",
        "user-c": "49.87654322",
      })?.custom ?? "",
      /at most 7 decimal places/
    );
  });
});

describe("percentage split", () => {
  function percent(shares: Record<string, string>) {
    return validateExpenseForm({ ...validPercent, percent: shares }, context);
  }

  it("accepts percentages that total exactly 100", () => {
    assert.equal(
      percent({ "user-a": "50", "user-b": "25", "user-c": "25" }),
      null
    );
    assert.equal(
      percent({ "user-a": "33.33", "user-b": "33.33", "user-c": "33.34" }),
      null
    );
  });

  it("rejects percentages that do not total 100 and shows the running total", () => {
    assert.match(
      percent({ "user-a": "30", "user-b": "30", "user-c": "30" })?.percent ?? "",
      /add up to 90% — they must add up to 100%/
    );
  });

  it("rejects a total that is off by a hundredth", () => {
    assert.ok(
      percent({ "user-a": "33.33", "user-b": "33.33", "user-c": "33.33" })
        ?.percent
    );
  });

  it("rejects a missing percentage", () => {
    assert.equal(
      percent({ "user-a": "100", "user-b": "" })?.percent,
      "Enter a percentage for every participant"
    );
  });

  it("rejects percentages with excessive precision", () => {
    assert.match(
      percent({ "user-a": "33.333", "user-b": "33.333", "user-c": "33.334" })
        ?.percent ?? "",
      /at most 2 decimal places/
    );
  });
});

describe("split type", () => {
  it("rejects an unrecognized split type", () => {
    assert.ok(validate({ splitType: "shares" })?.splitType);
  });
});

describe("multiple errors", () => {
  it("reports every offending field at once", () => {
    const result = validateExpenseForm(
      {
        title: "",
        amount: "",
        assetCode: "BTC",
        splitType: "equal",
        payerUserId: "stranger",
        participants: [],
        custom: {},
        percent: {},
      },
      context
    );
    assert.ok(result?.title);
    assert.ok(result?.amount);
    assert.ok(result?.assetCode);
    assert.ok(result?.payer);
    assert.ok(result?.participants);
  });
});
