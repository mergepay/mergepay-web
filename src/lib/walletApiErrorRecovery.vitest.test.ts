import { describe, expect, it } from "vitest";
import { recoveryActionFor, retryLabelFor } from "./settlementRetry";

describe("Wallet and API failure recovery actions (#614)", () => {
  it("maps Freighter wallet error codes to recovery actions and labels", () => {
    expect(recoveryActionFor("not_installed")).toBe("install");
    expect(recoveryActionFor("locked")).toBe("reconnect");
    expect(recoveryActionFor("disconnected")).toBe("reconnect");
    expect(recoveryActionFor(null)).toBe("retry");

    expect(retryLabelFor("locked")).toBe("Reconnect wallet");
    expect(retryLabelFor(null)).toBe("Try again");
  });
});
