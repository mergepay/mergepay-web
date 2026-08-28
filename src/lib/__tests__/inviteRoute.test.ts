import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inviteJoinPath, parseInviteCode } from "../inviteLink";

describe("invite deep-link routing", () => {
  it("only creates a join route for a validated token", () => {
    assert.equal(inviteJoinPath("ABC_123"), "/join/ABC_123");
    assert.equal(inviteJoinPath("../settings"), null);
  });

  it("accepts a token segment and leaves authentication to the join flow", () => {
    const parsed = parseInviteCode("invite-42");
    assert.deepEqual(parsed, { ok: true, code: "invite-42" });
  });
});
