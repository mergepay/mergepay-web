import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INVITE_CODE_MAX_LENGTH,
  describeInviteCodeProblem,
  describeInviteFailure,
  inviteJoinPath,
  isSafeInviteUrl,
  isValidInviteCode,
  parseInviteCode,
} from "../inviteLink";

describe("parseInviteCode — valid identifiers", () => {
  it("accepts a typical invite code", () => {
    assert.deepEqual(parseInviteCode("7QF3KD2P"), {
      ok: true,
      code: "7QF3KD2P",
    });
  });

  it("accepts URL-safe token characters", () => {
    assert.equal(isValidInviteCode("abc-DEF_123"), true);
  });

  it("trims surrounding whitespace from a pasted code", () => {
    assert.deepEqual(parseInviteCode("  7QF3KD2P \n"), {
      ok: true,
      code: "7QF3KD2P",
    });
  });

  it("accepts a code at exactly the maximum length", () => {
    const code = "A".repeat(INVITE_CODE_MAX_LENGTH);
    assert.equal(isValidInviteCode(code), true);
  });

  it("unwraps a single-element route segment array", () => {
    assert.deepEqual(parseInviteCode(["7QF3KD2P"]), {
      ok: true,
      code: "7QF3KD2P",
    });
  });

  it("preserves case — codes are opaque tokens", () => {
    const parsed = parseInviteCode("aBcDeF");
    assert.equal(parsed.ok && parsed.code, "aBcDeF");
  });
});

describe("parseInviteCode — malformed identifiers", () => {
  const cases: Array<[string, unknown, string]> = [
    ["undefined param", undefined, "missing"],
    ["null param", null, "missing"],
    ["empty string", "", "empty"],
    ["whitespace only", "   ", "empty"],
    ["percent-encoded space only", "%20", "empty"],
    ["too short", "AB", "too_short"],
    ["too long", "A".repeat(INVITE_CODE_MAX_LENGTH + 1), "too_long"],
    ["absurdly long", "A".repeat(50_000), "too_long"],
    ["path traversal", "../../etc/passwd", "malformed"],
    ["encoded traversal", "%2e%2e%2fadmin", "malformed"],
    ["absolute URL", "https://evil.example/join", "malformed"],
    ["script markup", "<script>alert(1)</script>", "malformed"],
    ["encoded markup", "%3Cscript%3E", "malformed"],
    ["quote injection", 'ABC"onmouseover="x', "malformed"],
    ["null byte", "ABCD\u0000", "malformed"],
    ["newline injection", "ABCD\nSet-Cookie: x=1", "malformed"],
    ["broken percent-encoding", "%E0%A4%A", "malformed"],
    ["query string smuggled in", "ABCD?token=secret", "malformed"],
    ["multiple route segments", ["a", "b"], "malformed"],
    ["non-string input", 42, "malformed"],
    ["object input", { code: "ABCD" }, "malformed"],
  ];

  for (const [name, input, problem] of cases) {
    it(`rejects ${name}`, () => {
      const parsed = parseInviteCode(input);
      assert.equal(parsed.ok, false, `${name} should not parse`);
      assert.equal(parsed.ok === false && parsed.problem, problem);
      assert.equal(
        parsed.ok === false && parsed.message.length > 0,
        true,
        "a user-facing message is always provided"
      );
    });
  }
});

describe("inviteJoinPath", () => {
  it("builds an in-app path for a valid code", () => {
    assert.equal(inviteJoinPath("7QF3KD2P"), "/join/7QF3KD2P");
  });

  it("returns null for a tampered value instead of interpolating it", () => {
    assert.equal(inviteJoinPath("../../login"), null);
    assert.equal(inviteJoinPath("https://evil.example"), null);
    assert.equal(inviteJoinPath(""), null);
    assert.equal(inviteJoinPath(null), null);
  });
});

describe("isSafeInviteUrl", () => {
  it("accepts https and http share links", () => {
    assert.equal(isSafeInviteUrl("https://mergepay.app/join/7QF3KD2P"), true);
    assert.equal(isSafeInviteUrl("http://localhost:3000/join/7QF3KD2P"), true);
  });

  it("rejects executable and data schemes", () => {
    assert.equal(isSafeInviteUrl("javascript:alert(1)"), false);
    assert.equal(isSafeInviteUrl("data:text/html,<script>alert(1)</script>"), false);
    assert.equal(isSafeInviteUrl("vbscript:msgbox(1)"), false);
  });

  it("rejects URLs carrying embedded credentials", () => {
    assert.equal(isSafeInviteUrl("https://user:secret@mergepay.app/join/A"), false);
  });

  it("rejects unparseable, empty and oversized values", () => {
    assert.equal(isSafeInviteUrl("not a url"), false);
    assert.equal(isSafeInviteUrl(""), false);
    assert.equal(isSafeInviteUrl(`https://mergepay.app/${"a".repeat(3000)}`), false);
    assert.equal(isSafeInviteUrl(undefined), false);
    assert.equal(isSafeInviteUrl(123), false);
  });
});

describe("describeInviteFailure", () => {
  it("distinguishes an already-used invite", () => {
    const r = describeInviteFailure({ status: 410, code: "INVITE_USED" });
    assert.equal(r.kind, "used");
    assert.equal(r.retryable, false);
  });

  it("distinguishes an expired invite", () => {
    assert.equal(
      describeInviteFailure({ status: 410, code: "INVITE_EXPIRED" }).kind,
      "expired"
    );
    // 410 without a specific code still reads as expired/gone.
    assert.equal(describeInviteFailure({ status: 410 }).kind, "expired");
  });

  it("distinguishes a revoked or unknown invite", () => {
    assert.equal(describeInviteFailure({ status: 404 }).kind, "not_found");
  });

  it("asks the recipient to sign in when unauthenticated", () => {
    assert.equal(
      describeInviteFailure({ status: 401 }).kind,
      "sign_in_required"
    );
    assert.equal(
      describeInviteFailure({ status: 403 }).kind,
      "sign_in_required"
    );
  });

  it("recognises an existing membership", () => {
    assert.equal(describeInviteFailure({ status: 409 }).kind, "already_member");
  });

  it("offers a retry only for transport and server failures", () => {
    assert.equal(describeInviteFailure({ status: 503 }).retryable, true);
    assert.equal(describeInviteFailure(new Error("offline")).retryable, true);
    assert.equal(describeInviteFailure({ status: 404 }).retryable, false);
  });

  it("never echoes the raw server message", () => {
    const r = describeInviteFailure({
      status: 500,
      code: "INTERNAL",
      message: "<img src=x onerror=alert(1)> at /var/app/secret.ts",
    });
    assert.equal(r.description.includes("<img"), false);
    assert.equal(r.description.includes("/var/app"), false);
  });
});

describe("describeInviteCodeProblem", () => {
  it("turns a parse failure into actionable guidance", () => {
    const parsed = parseInviteCode("<script>");
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    const r = describeInviteCodeProblem(parsed);
    assert.equal(r.kind, "invalid_link");
    assert.equal(r.retryable, false);
    assert.match(r.description, /fresh invite/);
  });
});
