import { describe, it, expect } from "vitest";
import { computeNextRunDate } from "./RecurringExpenseScheduler";

describe("RecurringExpenseScheduler computeNextRunDate (#643)", () => {
  it("advances past start dates to the next future occurrence across intervals", () => {
    const past = new Date("2025-01-01T00:00:00.000Z");
    const now = new Date();

    const nextWeekly = computeNextRunDate(past, "weekly");
    const nextBiweekly = computeNextRunDate(past, "biweekly");
    const nextMonthly = computeNextRunDate(past, "monthly");
    const nextCustom = computeNextRunDate(past, "custom", 10);

    expect(nextWeekly.getTime()).toBeGreaterThan(now.getTime());
    expect(nextBiweekly.getTime()).toBeGreaterThan(now.getTime());
    expect(nextMonthly.getTime()).toBeGreaterThan(now.getTime());
    expect(nextCustom.getTime()).toBeGreaterThan(now.getTime());
  });
});
