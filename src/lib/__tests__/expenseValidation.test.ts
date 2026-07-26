import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateExpenseForm } from "../expenseValidation";

const validEqual = {
  title: "Dinner at Terra Kulture",
  amount: "150.00",
  splitType: "equal",
  participants: ["user-a", "user-b", "user-c"],
  custom: {},
  percent: {},
};

const validCustom = {
  ...validEqual,
  splitType: "custom",
  custom: { "user-a": "50.00", "user-b": "50.00", "user-c": "50.00" },
};

const validPercent = {
  ...validEqual,
  splitType: "percentage",
  percent: { "user-a": "33.33", "user-b": "33.33", "user-c": "33.34" },
};

describe("validateExpenseForm", () => {
  it("returns null for valid equal split", () => {
    assert.equal(validateExpenseForm(validEqual), null);
  });

  it("returns null for valid custom split", () => {
    assert.equal(validateExpenseForm(validCustom), null);
  });

  it("returns null for valid percentage split", () => {
    assert.equal(validateExpenseForm(validPercent), null);
  });

  describe("title", () => {
    it("returns title error when title is empty", () => {
      const result = validateExpenseForm({ ...validEqual, title: "" });
      assert.equal(result?.title, "Title is required");
    });

    it("returns title error when title is only whitespace", () => {
      const result = validateExpenseForm({ ...validEqual, title: "   " });
      assert.equal(result?.title, "Title is required");
    });

    it("returns title error when title exceeds 80 characters", () => {
      const result = validateExpenseForm({ ...validEqual, title: "A".repeat(81) });
      assert.equal(result?.title, "Title must be 80 characters or fewer");
    });

    it("accepts title at exactly 80 characters", () => {
      const result = validateExpenseForm({ ...validEqual, title: "A".repeat(80) });
      assert.equal(result, null);
    });
  });

  describe("amount", () => {
    it("returns amount error when amount is empty", () => {
      const result = validateExpenseForm({ ...validEqual, amount: "" });
      assert.equal(result?.amount, "Amount is required");
    });

    it("returns amount error when amount is zero", () => {
      const result = validateExpenseForm({ ...validEqual, amount: "0" });
      assert.match(result?.amount ?? "", /positive/);
    });

    it("returns amount error when amount is negative", () => {
      const result = validateExpenseForm({ ...validEqual, amount: "-5" });
      assert.match(result?.amount ?? "", /positive/);
    });

    it("returns amount error when amount has 8 decimal places", () => {
      const result = validateExpenseForm({ ...validEqual, amount: "1.12345678" });
      assert.match(result?.amount ?? "", /7 decimal/);
    });

    it("accepts amount with 7 decimal places", () => {
      const result = validateExpenseForm({ ...validEqual, amount: "1.1234567" });
      assert.equal(result, null);
    });

    it("accepts amount with trailing dot", () => {
      const result = validateExpenseForm({ ...validEqual, amount: "50." });
      assert.equal(result, null);
    });

    it("returns amount error for non-numeric string", () => {
      const result = validateExpenseForm({ ...validEqual, amount: "abc" });
      assert.match(result?.amount ?? "", /positive/);
    });
  });

  describe("participants", () => {
    it("returns participants error when none selected", () => {
      const result = validateExpenseForm({ ...validEqual, participants: [] });
      assert.equal(result?.participants, "Select at least one participant");
    });

    it("accepts a single participant", () => {
      const result = validateExpenseForm({ ...validEqual, participants: ["user-a"] });
      assert.equal(result, null);
    });
  });

  describe("custom split sum", () => {
    it("returns custom error when amounts do not sum to total", () => {
      const result = validateExpenseForm({
        ...validEqual,
        splitType: "custom",
        custom: { "user-a": "10.00", "user-b": "20.00", "user-c": "30.00" },
      });
      assert.match(result?.custom ?? "", /must sum to/);
    });

    it("accepts custom amounts that exactly sum to total", () => {
      const result = validateExpenseForm({
        ...validEqual,
        splitType: "custom",
        custom: { "user-a": "50.00", "user-b": "50.00", "user-c": "50.00" },
      });
      assert.equal(result, null);
    });
  });

  describe("percentage split sum", () => {
    it("returns percent error when percentages do not sum to 100", () => {
      const result = validateExpenseForm({
        ...validEqual,
        splitType: "percentage",
        percent: { "user-a": "30", "user-b": "30", "user-c": "30" },
      });
      assert.equal(result?.percent, "Percentages must sum to 100");
    });

    it("accepts percentages that sum to 100", () => {
      const result = validateExpenseForm({
        ...validEqual,
        splitType: "percentage",
        percent: { "user-a": "50", "user-b": "25", "user-c": "25" },
      });
      assert.equal(result, null);
    });
  });

  describe("multiple errors", () => {
    it("returns multiple field errors at once", () => {
      const result = validateExpenseForm({
        title: "",
        amount: "",
        splitType: "equal",
        participants: [],
        custom: {},
        percent: {},
      });
      assert.ok(result?.title !== undefined);
      assert.ok(result?.amount !== undefined);
      assert.ok(result?.participants !== undefined);
    });
  });
});
