import { describe, expect, it } from "vitest";

import {
  classifyTokenExpiry,
  decodeJwt,
  untilTokenExpiryDelta,
} from "../sessionExpiry";

/** Build a real-ish JWT with the given exp (seconds since epoch). */
function buildToken(expSec: number): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub: "GABC", exp: expSec }));
  const sig = btoa("signature");
  return `${header.replace(/=/g, "")}.${payload.replace(/=/g, "")}.${sig.replace(/=/g, "")}`;
}

const NOW = 100_000 * 1000; // arbitrary fixed clock
const WARNING_MS = 2 * 60 * 1000; // 2m
const GRACE_MS = 5_000;

function classify(token: string, now = NOW) {
  return classifyTokenExpiry(token, { now, warningMs: WARNING_MS, graceMs: GRACE_MS });
}

describe("decodeJwt", () => {
  it("decodes the payload claims from a valid JWT", () => {
    const claims = decodeJwt(buildToken(Math.floor(NOW / 1000) + 600));
    expect(claims.exp).toBeGreaterThan(0);
    expect(claims.sub).toBe("GABC");
  });

  it("returns an empty object for a malformed / non-JWT string", () => {
    expect(decodeJwt("")).toEqual({});
    expect(decodeJwt("not-a-jwt")).toEqual({});
    expect(decodeJwt("a.b")).toEqual({});
    expect(decodeJwt("x.y.z")).toEqual({});
  });

  it("returns empty when the payload is not valid JSON", () => {
    expect(decodeJwt("aaa.%%%.ccc")).toEqual({});
  });
});

describe("classifyTokenExpiry", () => {
  it("classifies a comfortably-valid token as valid", () => {
    const { state } = classify(buildToken(Math.floor(NOW / 1000) + 3_600));
    expect(state).toBe("valid");
  });

  it("classifies a token expiring within the warning window as expiring", () => {
    const { state } = classify(buildToken(Math.floor((NOW + 60_000) / 1000))); // 60s left
    expect(state).toBe("expiring");
  });

  it("classifies a token at/within the grace margin as expired", () => {
    // 1s left — inside the 5s grace.
    const { state } = classify(buildToken(Math.floor((NOW + 1_000) / 1000)));
    expect(state).toBe("expired");
  });

  it("classifies an already-past token as expired", () => {
    const { state } = classify(buildToken(Math.floor((NOW - 10_000) / 1000)));
    expect(state).toBe("expired");
  });

  it("reports none for an empty token and unknown for one without exp", () => {
    expect(classifyTokenExpiry("", { now: NOW }).state).toBe("none");
    expect(classifyTokenExpiry(null, { now: NOW }).state).toBe("none");
    // btoa of {} -> non-numeric exp
    const noExp = `${btoa("{}").replace(/=/g, "")}.${btoa("{}").replace(/=/g, "")}.x`;
    expect(classify(noExp).state).toBe("unknown");
  });
});

describe("untilTokenExpiryDelta", () => {
  it("returns a positive, bounded delay for a valid token", () => {
    // 10 minutes left -> a large but finite delay, scheduled just under exp.
    const token = buildToken(Math.floor((NOW + 600_000) / 1000));
    const { delayMs, state } = untilTokenExpiryDelta(token, {
      now: NOW,
      graceMs: GRACE_MS,
    });
    expect(state).toBe("valid");
    expect(delayMs).not.toBeNull();
    expect(delayMs!).toBeGreaterThan(0);
    expect(delayMs!).toBeLessThanOrEqual(2 ** 31 - 1);
  });

  it("returns zero delay for an already-expired token", () => {
    const token = buildToken(Math.floor((NOW - 1) / 1000));
    const { delayMs, state } = untilTokenExpiryDelta(token, {
      now: NOW,
      graceMs: GRACE_MS,
    });
    expect(state).toBe("expired");
    expect(delayMs).toBe(0);
  });

  it("returns null delay when there is no token or no exp", () => {
    expect(untilTokenExpiryDelta("", { now: NOW }).delayMs).toBeNull();
    const noExp = `${btoa("{}").replace(/=/g, "")}.x.y`;
    expect(untilTokenExpiryDelta(noExp, { now: NOW }).delayMs).toBeNull();
  });
});