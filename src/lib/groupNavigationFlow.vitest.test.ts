import { describe, it, expect } from "vitest";
import { dedupeById } from "./settlementStatusDisplay";

describe("Group creation and navigation state deduplication (#604)", () => {
  it("deduplicates overlapping group list entries by id during navigation", () => {
    const groups = [
      { id: "grp-1", name: "Trip" },
      { id: "grp-2", name: "Dinner" },
      { id: "grp-1", name: "Trip duplicate" },
    ];
    expect(dedupeById(groups)).toEqual([
      { id: "grp-1", name: "Trip" },
      { id: "grp-2", name: "Dinner" },
    ]);
  });
});
