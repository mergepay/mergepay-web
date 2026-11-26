import { describe, expect, it } from "vitest";
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_IDLE_WARNING_MS,
  evaluateIdleState,
  resolveIdleTimeoutConfig,
} from "./idleTimeout";

describe("resolveIdleTimeoutConfig", () => {
  it("defaults to a 15 minute lock with a 1 minute warning", () => {
    expect(resolveIdleTimeoutConfig()).toEqual({
      timeoutMs: 15 * 60 * 1000,
      warningMs: 60 * 1000,
    });
    expect(DEFAULT_IDLE_TIMEOUT_MS).toBe(900_000);
    expect(DEFAULT_IDLE_WARNING_MS).toBe(60_000);
  });

  it("accepts explicit overrides so a deployment can tune the threshold", () => {
    expect(
      resolveIdleTimeoutConfig({ timeoutMs: 600_000, warningMs: 120_000 })
    ).toEqual({ timeoutMs: 600_000, warningMs: 120_000 });
  });

  it("clamps the warning to the timeout and ignores invalid values", () => {
    expect(
      resolveIdleTimeoutConfig({ timeoutMs: 30_000, warningMs: 60_000 })
    ).toEqual({ timeoutMs: 30_000, warningMs: 30_000 });

    expect(
      resolveIdleTimeoutConfig({
        timeoutMs: Number.NaN,
        warningMs: -1,
      })
    ).toEqual({
      timeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
      warningMs: DEFAULT_IDLE_WARNING_MS,
    });
  });
});

describe("evaluateIdleState", () => {
  const timeoutMs = 10_000;
  const warningMs = 3_000;
  const lastActivityAt = 1_000_000;

  it("stays active before the warning window", () => {
    expect(
      evaluateIdleState({
        lastActivityAt,
        now: lastActivityAt + 6_999,
        timeoutMs,
        warningMs,
      })
    ).toEqual({ phase: "active", idleMs: 6_999, remainingMs: 3_001 });
  });

  it("enters the warning phase exactly at the warning boundary", () => {
    expect(
      evaluateIdleState({
        lastActivityAt,
        now: lastActivityAt + 7_000,
        timeoutMs,
        warningMs,
      })
    ).toEqual({ phase: "warning", idleMs: 7_000, remainingMs: 3_000 });
  });

  it("expires at the timeout boundary and reports no time left", () => {
    expect(
      evaluateIdleState({
        lastActivityAt,
        now: lastActivityAt + 10_000,
        timeoutMs,
        warningMs,
      })
    ).toEqual({ phase: "expired", idleMs: 10_000, remainingMs: 0 });
  });

  it("treats a backwards clock as fresh activity instead of locking", () => {
    expect(
      evaluateIdleState({
        lastActivityAt,
        now: lastActivityAt - 5_000,
        timeoutMs,
        warningMs,
      })
    ).toEqual({ phase: "active", idleMs: 0, remainingMs: timeoutMs });
  });
});
