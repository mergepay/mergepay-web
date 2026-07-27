import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INVITE_DEFAULT_MAX_AGE_DAYS,
  fetchInviteByCode,
  validateInviteShape,
} from "../invites";
import type { Invite } from "../types";

const NOW = new Date("2026-07-26T12:00:00Z");

const freshInvite = (overrides: Partial<Invite> = {}): Invite => ({
  id: "inv-1",
  groupId: "g1",
  code: "ABCD1234",
  url: "https://example.com/join/ABCD1234",
  expiresAt: null,
  maxUses: null,
  uses: 0,
  createdAt: NOW.toISOString(),
  ...overrides,
});

describe("validateInviteShape", () => {
  it("accepts a fresh invite with no expiry or usage cap", () => {
    const v = validateInviteShape(freshInvite(), { now: NOW });
    assert.equal(v.ok, true);
  });

  it("rejects when uses has reached maxUses (used up)", () => {
    const v = validateInviteShape(
      freshInvite({ maxUses: 5, uses: 5 }),
      { now: NOW }
    );
    assert.equal(v.ok, false);
    if (!v.ok) {
      assert.equal(v.code, "INVITE_USED");
      assert.equal(v.status, 410);
    }
  });

  it("rejects when uses has exceeded maxUses", () => {
    const v = validateInviteShape(
      freshInvite({ maxUses: 2, uses: 3 }),
      { now: NOW }
    );
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.code, "INVITE_USED");
  });

  it("rejects when explicit expiresAt is in the past", () => {
    const v = validateInviteShape(
      freshInvite({
        expiresAt: new Date(NOW.getTime() - 1000).toISOString(),
      }),
      { now: NOW }
    );
    assert.equal(v.ok, false);
    if (!v.ok) {
      assert.equal(v.code, "INVITE_EXPIRED");
      assert.equal(v.status, 410);
    }
  });

  it("accepts when explicit expiresAt is in the future", () => {
    const v = validateInviteShape(
      freshInvite({
        expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      }),
      { now: NOW }
    );
    assert.equal(v.ok, true);
  });

  it("rejects when createdAt is older than the max-age policy", () => {
    const old = new Date(
      NOW.getTime() - (INVITE_DEFAULT_MAX_AGE_DAYS + 1) * 86_400_000
    );
    const v = validateInviteShape(
      freshInvite({ createdAt: old.toISOString() }),
      { now: NOW }
    );
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.code, "INVITE_EXPIRED");
  });

  it("honours a custom maxAgeDays override", () => {
    const oneDayOld = new Date(NOW.getTime() - 2 * 86_400_000);
    const v = validateInviteShape(
      freshInvite({ createdAt: oneDayOld.toISOString() }),
      { now: NOW, maxAgeDays: 1 }
    );
    assert.equal(v.ok, false);
  });

  it("single-use (maxUses=1) invite is consumed after first use", () => {
    const v = validateInviteShape(
      freshInvite({ maxUses: 1, uses: 1 }),
      { now: NOW }
    );
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.code, "INVITE_USED");
  });
});

describe("fetchInviteByCode", () => {
  it("returns the invite on a 200 response", async () => {
    const invite: Invite = freshInvite();
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ invite }), { status: 200 });
    const result = await fetchInviteByCode(
      "ABCD1234",
      "tok",
      "http://upstream.test",
      fakeFetch
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.invite.id, "inv-1");
  });

  it("returns 404-shaped failure when upstream returns 404", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response("", { status: 404 });
    const result = await fetchInviteByCode(
      "BAD",
      null,
      "http://upstream.test",
      fakeFetch
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 404);
  });

  it("returns 502-shaped failure on transport errors", async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    const result = await fetchInviteByCode(
      "ANY",
      null,
      "http://upstream.test",
      fakeFetch
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 502);
  });

  it("returns 404 when response body has no invite", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({}), { status: 200 });
    const result = await fetchInviteByCode(
      "ANY",
      null,
      "http://upstream.test",
      fakeFetch
    );
    assert.equal(result.ok, false);
  });

  it("URL-encodes the code", async () => {
    let requestedUrl = "";
    const fakeFetch: typeof fetch = async (input) => {
      requestedUrl =
        typeof input === "string" ? input : (input as URL).toString();
      return new Response(JSON.stringify({ invite: freshInvite() }), {
        status: 200,
      });
    };
    await fetchInviteByCode(
      "code/with spaces",
      null,
      "http://upstream.test",
      fakeFetch
    );
    assert.ok(requestedUrl.includes("code%2Fwith%20spaces"));
  });
});
