import { describe, it, expect } from "vitest";
import { simplifyDebts } from "../settlementUtils";

const user = (id: string) => ({ id, stellarPublicKey: `G${id}`, displayName: id, avatarUrl: null, createdAt: "2024-01-01" });
describe("simplifyDebts", () => {
  it("reduces a cycle to the minimum transfers", () => {
    const rows = ["10", "-4", "-6"].map((net, i) => ({ userId: `${i}`, user: user(`${i}`), net, assetCode: "XLM" }));
    expect(simplifyDebts(rows).map((p) => [p.fromUserId, p.toUserId, p.amount])).toEqual([["1", "0", "4"], ["2", "0", "6"]]);
  });
  it("preserves seven-decimal precision", () => {
    const rows = [{ userId: "a", user: user("a"), net: "0.0000001", assetCode: "XLM" }, { userId: "b", user: user("b"), net: "-0.0000001", assetCode: "XLM" }];
    expect(simplifyDebts(rows)[0].amount).toBe("0.0000001");
  });
});
