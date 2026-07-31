import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PERCENT_DECIMAL_PLACES,
  sumDecimalStrings,
  validateExpenseSplit,
  type ExpenseSplitDraft,
} from "../expenseValidation";
import { parseExactDecimal, MAX_DECIMAL_PLACES } from "../money";
import { STABLE_ASSET } from "../constants";

const MEMBERS = ["user-a", "user-b", "user-c"];

function draft(overrides: Partial<ExpenseSplitDraft> = {}): ExpenseSplitDraft {
  return {
    title: "Dinner at Terra Kulture",
    amount: "150",
    splitType: "equal",
    participants: [...MEMBERS],
    custom: {},
    percent: {},
    eligibleParticipantIds: [...MEMBERS],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseExactDecimal — the exact-integer foundation the split checks rely on
// ---------------------------------------------------------------------------

describe("parseExactDecimal", () => {
  const cases: {
    name: string;
    raw: string;
    scale: number;
    expected: string | { error: string };
  }[] = [
    { name: "whole number", raw: "150", scale: 7, expected: "1500000000" },
    { name: "trailing zeros are insignificant", raw: "150.00", scale: 7, expected: "1500000000" },
    { name: "full stroop precision", raw: "1.1234567", scale: 7, expected: "11234567" },
    { name: "one stroop", raw: "0.0000001", scale: 7, expected: "1" },
    { name: "negative exponent", raw: "1e-7", scale: 7, expected: "1" },
    { name: "positive exponent", raw: "1.5e2", scale: 7, expected: "1500000000" },
    { name: "leading dot", raw: ".5", scale: 7, expected: "5000000" },
    { name: "trailing dot", raw: "50.", scale: 7, expected: "500000000" },
    { name: "whitespace padded", raw: "  2.5  ", scale: 7, expected: "25000000" },
    { name: "explicit plus sign", raw: "+3", scale: 7, expected: "30000000" },
    { name: "negative value", raw: "-1.5", scale: 7, expected: "-15000000" },
    {
      name: "beyond stroop precision",
      raw: "1.12345678",
      scale: 7,
      expected: { error: "too_precise" },
    },
    { name: "empty string", raw: "", scale: 7, expected: { error: "empty" } },
    { name: "whitespace only", raw: "   ", scale: 7, expected: { error: "empty" } },
    { name: "letters", raw: "abc", scale: 7, expected: { error: "not_a_number" } },
    { name: "trailing letters", raw: "12abc", scale: 7, expected: { error: "not_a_number" } },
    { name: "thousands separator", raw: "1,000", scale: 7, expected: { error: "not_a_number" } },
    { name: "Infinity", raw: "Infinity", scale: 7, expected: { error: "not_a_number" } },
    { name: "percent scale", raw: "33.33", scale: 4, expected: "333300" },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = parseExactDecimal(c.raw, c.scale);
      if (typeof c.expected === "string") {
        assert.equal(result.ok, true, `expected ${c.raw} to parse`);
        assert.equal(
          result.ok ? result.value.scaled.toString() : "",
          c.expected
        );
      } else {
        assert.equal(result.ok, false, `expected ${c.raw} to fail`);
        assert.equal(result.ok ? "" : result.error, c.expected.error);
      }
    });
  }

  it("does not lose precision the way Number() does", () => {
    // Number("1.1234567").toFixed(20) is not "1.12345670000000000000".
    const result = parseExactDecimal("1.1234567", MAX_DECIMAL_PLACES);
    assert.equal(result.ok && result.value.plain, "1.1234567");
  });
});

// ---------------------------------------------------------------------------
// Valid splits
// ---------------------------------------------------------------------------

describe("validateExpenseSplit — valid drafts", () => {
  it("accepts an equal split and emits one share per participant", () => {
    const result = validateExpenseSplit(draft());
    assert.equal(result.valid, true);
    assert.deepEqual(result.normalized?.shares, [
      { userId: "user-a" },
      { userId: "user-b" },
      { userId: "user-c" },
    ]);
    assert.equal(result.normalized?.amount, "150");
  });

  it("accepts a custom split that sums exactly to the total", () => {
    const result = validateExpenseSplit(
      draft({
        splitType: "custom",
        custom: { "user-a": "50.00", "user-b": "50", "user-c": "50.0000000" },
      })
    );
    assert.equal(result.valid, true);
    assert.deepEqual(result.normalized?.shares, [
      { userId: "user-a", amount: "50" },
      { userId: "user-b", amount: "50" },
      { userId: "user-c", amount: "50" },
    ]);
  });

  it("accepts a custom split that binary floating point would reject", () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754 doubles.
    const result = validateExpenseSplit(
      draft({
        amount: "0.3",
        splitType: "custom",
        participants: ["user-a", "user-b"],
        custom: { "user-a": "0.1", "user-b": "0.2" },
      })
    );
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });

  it("accepts stroop-level custom shares", () => {
    const result = validateExpenseSplit(
      draft({
        amount: "0.0000003",
        splitType: "custom",
        participants: ["user-a", "user-b", "user-c"],
        custom: {
          "user-a": "0.0000001",
          "user-b": "0.0000001",
          "user-c": "0.0000001",
        },
      })
    );
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });

  it("accepts percentages that sum to exactly 100", () => {
    const result = validateExpenseSplit(
      draft({
        splitType: "percentage",
        percent: { "user-a": "33.33", "user-b": "33.33", "user-c": "33.34" },
      })
    );
    assert.equal(result.valid, true);
    assert.deepEqual(result.normalized?.shares, [
      { userId: "user-a", percent: 33.33 },
      { userId: "user-b", percent: 33.33 },
      { userId: "user-c", percent: 33.34 },
    ]);
  });

  it("does not change the value the user entered", () => {
    const result = validateExpenseSplit(draft({ amount: "42.5000000" }));
    assert.equal(result.normalized?.amount, "42.5");
    assert.equal(Number(result.normalized?.amount), 42.5);
  });

  it("ignores custom entries for members who are not participants", () => {
    const result = validateExpenseSplit(
      draft({
        splitType: "custom",
        participants: ["user-a", "user-b"],
        custom: { "user-a": "75", "user-b": "75", "user-c": "999" },
      })
    );
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.normalized?.shares.length, 2);
  });

  it("accepts a supported non-native asset", () => {
    const result = validateExpenseSplit(
      draft({ assetCode: STABLE_ASSET.code, assetIssuer: STABLE_ASSET.issuer })
    );
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });
});

// ---------------------------------------------------------------------------
// Invalid splits
// ---------------------------------------------------------------------------

describe("validateExpenseSplit — rejected drafts", () => {
  const cases: {
    name: string;
    draft: ExpenseSplitDraft;
    field: string;
    match?: RegExp;
    participant?: string;
  }[] = [
    {
      name: "empty title",
      draft: draft({ title: "   " }),
      field: "title",
      match: /required/i,
    },
    {
      name: "title over 80 characters",
      draft: draft({ title: "A".repeat(81) }),
      field: "title",
      match: /80/,
    },
    {
      name: "empty amount",
      draft: draft({ amount: "" }),
      field: "amount",
      match: /required/i,
    },
    {
      name: "zero amount",
      draft: draft({ amount: "0" }),
      field: "amount",
      match: /positive/i,
    },
    {
      name: "negative amount",
      draft: draft({ amount: "-10" }),
      field: "amount",
      match: /positive/i,
    },
    {
      name: "amount beyond stroop precision",
      draft: draft({ amount: "1.12345678" }),
      field: "amount",
      match: /7 decimal/,
    },
    {
      name: "non-numeric amount",
      draft: draft({ amount: "abc" }),
      field: "amount",
      match: /positive/i,
    },
    {
      name: "unsupported asset",
      draft: draft({ assetCode: "DOGE", assetIssuer: null }),
      field: "asset",
      match: /not supported/i,
    },
    {
      name: "no participants selected",
      draft: draft({ participants: [] }),
      field: "participants",
      match: /at least one/i,
    },
    {
      name: "group with no eligible members",
      draft: draft({ participants: [], eligibleParticipantIds: [] }),
      field: "participants",
      match: /no members/i,
    },
    {
      name: "duplicate participant",
      draft: draft({ participants: ["user-a", "user-a", "user-b"] }),
      field: "participants",
      match: /only be selected once/i,
      participant: "user-a",
    },
    {
      name: "participant who left the group",
      draft: draft({ participants: ["user-a", "user-z"] }),
      field: "participants",
      match: /no longer a member/i,
      participant: "user-z",
    },
    {
      name: "custom shares below the total",
      draft: draft({
        splitType: "custom",
        custom: { "user-a": "10", "user-b": "20", "user-c": "30" },
      }),
      field: "custom",
      match: /must sum to 150 \(currently 60\)/,
    },
    {
      name: "custom shares one stroop over the total",
      draft: draft({
        splitType: "custom",
        custom: { "user-a": "50", "user-b": "50", "user-c": "50.0000001" },
      }),
      field: "custom",
      match: /must sum to/,
    },
    {
      name: "custom share left empty",
      draft: draft({
        splitType: "custom",
        custom: { "user-a": "75", "user-b": "75", "user-c": "" },
      }),
      field: "custom",
      participant: "user-c",
    },
    {
      name: "negative custom share",
      draft: draft({
        splitType: "custom",
        custom: { "user-a": "-50", "user-b": "100", "user-c": "100" },
      }),
      field: "custom",
      participant: "user-a",
    },
    {
      name: "zero custom share",
      draft: draft({
        splitType: "custom",
        custom: { "user-a": "0", "user-b": "75", "user-c": "75" },
      }),
      field: "custom",
      participant: "user-a",
    },
    {
      name: "custom share beyond stroop precision",
      draft: draft({
        splitType: "custom",
        custom: { "user-a": "50.12345678", "user-b": "50", "user-c": "49.87654322" },
      }),
      field: "custom",
      participant: "user-a",
    },
    {
      name: "percentages below 100",
      draft: draft({
        splitType: "percentage",
        percent: { "user-a": "30", "user-b": "30", "user-c": "30" },
      }),
      field: "percent",
      match: /sum to 100/,
    },
    {
      name: "percentages one ten-thousandth over 100",
      draft: draft({
        splitType: "percentage",
        percent: { "user-a": "33.3333", "user-b": "33.3333", "user-c": "33.3335" },
      }),
      field: "percent",
      match: /sum to 100/,
    },
    {
      name: "single percentage above 100",
      draft: draft({
        splitType: "percentage",
        percent: { "user-a": "150", "user-b": "0.1", "user-c": "0.1" },
      }),
      field: "percent",
      participant: "user-a",
    },
    {
      name: "percentage beyond supported precision",
      draft: draft({
        splitType: "percentage",
        percent: { "user-a": "33.33333", "user-b": "33.33", "user-c": "33.33667" },
      }),
      field: "percent",
      participant: "user-a",
    },
  ];

  for (const c of cases) {
    it(`rejects ${c.name}`, () => {
      const result = validateExpenseSplit(c.draft);
      assert.equal(result.valid, false);
      assert.equal(result.normalized, null, "no payload for an invalid draft");
      assert.ok(
        result.errors[c.field],
        `expected an error on "${c.field}", got ${JSON.stringify(result.errors)}`
      );
      if (c.match) {
        assert.match(result.errors[c.field] ?? "", c.match);
      }
      if (c.participant) {
        assert.ok(
          result.participantErrors[c.participant],
          `expected a participant error for ${c.participant}, got ${JSON.stringify(
            result.participantErrors
          )}`
        );
      }
    });
  }

  it("reports every broken field at once", () => {
    const result = validateExpenseSplit(
      draft({ title: "", amount: "", participants: [] })
    );
    assert.ok(result.errors.title);
    assert.ok(result.errors.amount);
    assert.ok(result.errors.participants);
  });

  it("does not report split sums while the participant list is already invalid", () => {
    const result = validateExpenseSplit(
      draft({ participants: [], splitType: "custom", custom: {} })
    );
    assert.ok(result.errors.participants);
    assert.equal(result.errors.custom, undefined);
  });
});

// ---------------------------------------------------------------------------
// Reacting to participant changes
// ---------------------------------------------------------------------------

describe("validateExpenseSplit — participant changes", () => {
  it("becomes invalid when a participant is added without a share", () => {
    const base = draft({
      splitType: "custom",
      participants: ["user-a", "user-b"],
      custom: { "user-a": "75", "user-b": "75" },
    });
    assert.equal(validateExpenseSplit(base).valid, true);

    const withExtra = { ...base, participants: [...base.participants, "user-c"] };
    const result = validateExpenseSplit(withExtra);
    assert.equal(result.valid, false);
    assert.ok(result.participantErrors["user-c"]);
  });

  it("becomes valid again when a participant is removed and the sum matches", () => {
    const base = draft({
      amount: "100",
      splitType: "custom",
      participants: ["user-a", "user-b", "user-c"],
      custom: { "user-a": "50", "user-b": "50", "user-c": "50" },
    });
    assert.equal(validateExpenseSplit(base).valid, false);

    const trimmed = { ...base, participants: ["user-a", "user-b"] };
    assert.equal(validateExpenseSplit(trimmed).valid, true);
  });

  it("keeps rejecting a departed member until they are deselected", () => {
    const withDeparted = draft({
      participants: ["user-a", "user-b", "user-gone"],
      eligibleParticipantIds: ["user-a", "user-b"],
    });
    assert.equal(validateExpenseSplit(withDeparted).valid, false);

    const deselected = { ...withDeparted, participants: ["user-a", "user-b"] };
    assert.equal(validateExpenseSplit(deselected).valid, true);
  });
});

// ---------------------------------------------------------------------------
// sumDecimalStrings
// ---------------------------------------------------------------------------

describe("sumDecimalStrings", () => {
  const cases: { name: string; values: string[]; scale: number; expected: string }[] = [
    { name: "empty list", values: [], scale: MAX_DECIMAL_PLACES, expected: "0" },
    {
      name: "float-hostile decimals",
      values: ["0.1", "0.2"],
      scale: MAX_DECIMAL_PLACES,
      expected: "0.3",
    },
    {
      name: "skips unparseable entries",
      values: ["10", "", "abc", "5"],
      scale: MAX_DECIMAL_PLACES,
      expected: "15",
    },
    {
      name: "percent scale",
      values: ["33.33", "33.33", "33.34"],
      scale: MAX_PERCENT_DECIMAL_PLACES,
      expected: "100",
    },
    {
      name: "stroop precision preserved",
      values: ["0.0000001", "0.0000002"],
      scale: MAX_DECIMAL_PLACES,
      expected: "0.0000003",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      assert.equal(sumDecimalStrings(c.values, c.scale), c.expected);
    });
  }
});
