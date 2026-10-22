import { describe, it, expect } from "vitest";
import { formatMoney } from "./format";
import { calculateSplit, splitEqual } from "./split";

describe("Group creation and equal expense splitting flow (#612)", () => {
  it("splits group expenses evenly across participants and reports balanced state", () => {
    const shares = splitEqual("90", ["alice", "bob", "carol"]);
    expect(shares).toEqual([
      { userId: "alice", amount: "30.0000000" },
      { userId: "bob", amount: "30.0000000" },
      { userId: "carol", amount: "30.0000000" },
    ]);
    expect(formatMoney(shares[0]?.amount, "USDC")).toBe("30.00 USDC");

    const calc = calculateSplit("equal", "90", [
      { userId: "alice" },
      { userId: "bob" },
      { userId: "carol" },
    ]);
    expect(calc.balance).toBe("balanced");
    expect(calc.rows.map((r) => r.amount)).toEqual([
      "30.0000000",
      "30.0000000",
      "30.0000000",
    ]);
  });
});
