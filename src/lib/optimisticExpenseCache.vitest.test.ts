import { describe, it, expect } from "vitest";
import { dedupeById } from "./settlementStatusDisplay";

describe("Optimistic expense creation cache reconciliation (#602)", () => {
  it("reconciles optimistic and server-confirmed expense records without duplicates", () => {
    const optimistic = { id: "exp-101", amount: 45 };
    const confirmed = { id: "exp-101", amount: 45 };
    const merged = dedupeById([confirmed, optimistic]);
    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBe(45);
  });
});
