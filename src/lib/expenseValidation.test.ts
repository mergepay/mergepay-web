import { describe, it, expect } from "vitest";
import { validateExpenseForm } from "./expenseValidation";

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
    expect(validateExpenseForm(validEqual)).toBeNull();
  });

  it("returns null for valid custom split", () => {
    expect(validateExpenseForm(validCustom)).toBeNull();
  });

  it("returns null for valid percentage split", () => {
    expect(validateExpenseForm(validPercent)).toBeNull();
  });

  describe("title", () => {
    it("returns title error when title is empty", () => {
      const result = validateExpenseForm({ ...validEqual, title: "" });
      expect(result?.title).toBe("Title is required");
    });

    it("returns title error when title is only whitespace", () => {
      const result = validateExpenseForm({ ...validEqual, title: "   " });
      expect(result?.title).toBe("Title is required");
    });

    it("returns title error when title exceeds 80 characters", () => {
      const result = validateExpenseForm({ ...validEqual, title: "A".repeat(81) });
      expect(result?.title).toBe("Title must be 80 characters or fewer");
    });

    it("accepts title at exactly 80 characters", () => {
      const result = validateExpenseForm({ ...validEqual, title: "A".repeat(80) });
      expect(result).toBeNull();
    });
  });

  describe("amount", () => {
    it("returns amount error when amount is empty", () => {
      const result = validateExpenseForm({ ...validEqual, amount: "" });
      expect(result?.amount).toBe("Amount is required");
    });

    it("returns amount error when amount is zero", () => {
      const result = validateExpenseForm({ ...validEqual, amount: "0" });
      expect(result?.amount).toMatch(/positive/);
    });

    it("returns amount error when amount is negative", () => {
      const result = validateExpenseForm({ ...validEqual, amount: "-5" });
      expect(result?.amount).toMatch(/positive/);
    });

    it("returns amount error when amount has 8 decimal places", () => {
      const result = validateExpenseForm({ ...validEqual, amount: "1.12345678" });
      expect(result?.amount).toMatch(/7 decimal/);
    });

    it("accepts amount with 7 decimal places", () => {
      const result = validateExpenseForm({ ...validEqual, amount: "1.1234567" });
      expect(result).toBeNull();
    });

    it("accepts amount with trailing dot", () => {
      const result = validateExpenseForm({ ...validEqual, amount: "50." });
      expect(result).toBeNull();
    });

    it("returns amount error for non-numeric string", () => {
      const result = validateExpenseForm({ ...validEqual, amount: "abc" });
      expect(result?.amount).toMatch(/positive/);
    });
  });

  describe("participants", () => {
    it("returns participants error when none selected", () => {
      const result = validateExpenseForm({ ...validEqual, participants: [] });
      expect(result?.participants).toBe("Select at least one participant");
    });

    it("accepts a single participant", () => {
      const result = validateExpenseForm({ ...validEqual, participants: ["user-a"] });
      expect(result).toBeNull();
    });
  });

  describe("custom split sum", () => {
    it("returns custom error when amounts do not sum to total", () => {
      const result = validateExpenseForm({
        ...validEqual,
        splitType: "custom",
        custom: { "user-a": "10.00", "user-b": "20.00", "user-c": "30.00" },
      });
      expect(result?.custom).toMatch(/must sum to/);
    });

    it("accepts custom amounts that exactly sum to total", () => {
      const result = validateExpenseForm({
        ...validEqual,
        splitType: "custom",
        custom: { "user-a": "50.00", "user-b": "50.00", "user-c": "50.00" },
      });
      expect(result).toBeNull();
    });
  });

  describe("percentage split sum", () => {
    it("returns percent error when percentages do not sum to 100", () => {
      const result = validateExpenseForm({
        ...validEqual,
        splitType: "percentage",
        percent: { "user-a": "30", "user-b": "30", "user-c": "30" },
      });
      expect(result?.percent).toBe("Percentages must sum to 100");
    });

    it("accepts percentages that sum to 100", () => {
      const result = validateExpenseForm({
        ...validEqual,
        splitType: "percentage",
        percent: { "user-a": "50", "user-b": "25", "user-c": "25" },
      });
      expect(result).toBeNull();
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
      expect(result?.title).toBeDefined();
      expect(result?.amount).toBeDefined();
      expect(result?.participants).toBeDefined();
    });
  });
});
