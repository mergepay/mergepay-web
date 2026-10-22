import { describe, it, expect } from "vitest";
import { describeSettlementStatus } from "./settlementStatusDisplay";

describe("describeSettlementStatus feedback states (#609)", () => {
  it("returns distinct labels and kinds for pending, confirmed, and failed statuses", () => {
    const pending = describeSettlementStatus("pending");
    const confirmed = describeSettlementStatus("confirmed");
    const failed = describeSettlementStatus("failed");
    expect(pending.label).toBeTruthy();
    expect(confirmed.label).toBeTruthy();
    expect(failed.label).toBeTruthy();
    expect(pending.label).not.toBe(confirmed.label);
    expect(confirmed.label).not.toBe(failed.label);
    expect(failed.canRecover).toBe(true);
  });
});
