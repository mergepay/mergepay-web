import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  looksSensitive,
  resetTelemetry,
  sanitizeTelemetryProperties,
  setTelemetryEnabled,
  setTelemetryProvider,
  telemetryErrorCode,
  track,
  type TelemetryEvent,
  type TelemetryEventName,
} from "./telemetry";

/**
 * Telemetry wrapper (#886). The point of these tests is the privacy contract:
 * no payload a provider receives may contain a key, signature, token, address
 * or other identifying value, however a call site is written.
 */

const PUBLIC_KEY = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const SECRET_SEED = "SBKGCMBY56MHTT4EGE3YJIYL4CPWKSGJ7VDEQF4J3B3VO6CAXA7EG5CY";
const JWT_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJl";
const SIGNED_XDR =
  "AAAAAgAAAABi/B0L0JGythwN1lY0aypo19NHxvLCyO5tBEcCVvwF9wAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAA=";
const TX_HASH = "3389e9f0f1a65f19736cacf544c2e825313e8447f569233bb8db39aa607c8889";

let events: TelemetryEvent[];

beforeEach(() => {
  resetTelemetry();
  setTelemetryEnabled(true);
  events = [];
  setTelemetryProvider({ track: (event) => events.push(event) });
});

afterEach(() => {
  resetTelemetry();
});

/** Every string anywhere in what the provider received. */
function everyValue(): string {
  return JSON.stringify(events);
}

describe("track", () => {
  it("forwards a typed event with a timestamp", () => {
    track("expense_created", { splitType: "equal", participantCount: 3 });
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("expense_created");
    expect(events[0].properties).toEqual({ splitType: "equal", participantCount: 3 });
    expect(typeof events[0].timestamp).toBe("number");
  });

  it("accepts property-less events", () => {
    track("wallet_connect_started");
    expect(events[0]).toMatchObject({ name: "wallet_connect_started", properties: {} });
  });

  it("is a no-op by default (no provider configured)", () => {
    resetTelemetry();
    setTelemetryEnabled(true);
    expect(() => track("wallet_connect_started")).not.toThrow();
    expect(events).toHaveLength(0);
  });

  it("swallows provider failures so the observed flow continues", () => {
    setTelemetryProvider({
      track: () => {
        throw new Error("vendor down");
      },
    });
    expect(() => track("wallet_connect_started")).not.toThrow();
  });

  it("can be disabled, and respects Do Not Track by default", () => {
    setTelemetryEnabled(false);
    track("wallet_connect_started");
    expect(events).toHaveLength(0);

    setTelemetryEnabled(null);
    Object.defineProperty(navigator, "doNotTrack", { value: "1", configurable: true });
    try {
      track("wallet_connect_started");
      expect(events).toHaveLength(0);
    } finally {
      delete (navigator as { doNotTrack?: string }).doNotTrack;
    }
    track("wallet_connect_started");
    expect(events).toHaveLength(1);
  });

  it("lets providers be swapped without touching call sites", () => {
    const second: TelemetryEvent[] = [];
    setTelemetryProvider({ track: (event) => second.push(event) });
    track("group_created", { hasDescription: true });
    expect(events).toHaveLength(0);
    expect(second).toHaveLength(1);
  });
});

describe("payloads never contain sensitive data", () => {
  it("drops undeclared properties, even when a caller forces them through", () => {
    // Simulates a careless call site bypassing the types.
    (track as (name: TelemetryEventName, props: Record<string, unknown>) => void)("wallet_connect_succeeded", {
      durationMs: 120,
      publicKey: PUBLIC_KEY,
      secret: SECRET_SEED,
      token: JWT_TOKEN,
      signedXdr: SIGNED_XDR,
      txHash: TX_HASH,
      displayName: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(events[0].properties).toEqual({ durationMs: 120 });
    for (const secret of [PUBLIC_KEY, SECRET_SEED, JWT_TOKEN, SIGNED_XDR, TX_HASH, "Ada", "ada@example.com"]) {
      expect(everyValue()).not.toContain(secret);
    }
  });

  it("drops sensitive-looking values smuggled into declared string properties", () => {
    for (const value of [PUBLIC_KEY, SECRET_SEED, JWT_TOKEN, SIGNED_XDR, TX_HASH, "ada@example.com"]) {
      const props = sanitizeTelemetryProperties("wallet_disconnected", { reason: value });
      expect(props).toEqual({});
    }
  });

  it("keeps only primitives (no error objects, arrays or nested payloads)", () => {
    const props = sanitizeTelemetryProperties("wallet_connect_failed", {
      stage: "sign",
      errorCode: new Error(`bad key ${SECRET_SEED}`),
      durationMs: { nested: PUBLIC_KEY },
    });
    expect(props).toEqual({ stage: "sign" });
  });

  it("drops non-finite numbers and truncates long strings", () => {
    expect(sanitizeTelemetryProperties("wallet_connect_succeeded", { durationMs: Number.NaN })).toEqual({});
    const long = sanitizeTelemetryProperties("wallet_disconnected", { reason: "a b ".repeat(100) });
    expect(String(long.reason).length).toBeLessThanOrEqual(64);
  });

  it("never blocks a declared, harmless property key", () => {
    // Guards the sensitive-key pattern against false positives such as
    // "ip" inside "participantCount".
    expect(sanitizeTelemetryProperties("expense_created", { splitType: "custom", participantCount: 4 })).toEqual({
      splitType: "custom",
      participantCount: 4,
    });
    expect(sanitizeTelemetryProperties("bulk_settlement_submitted", { expenseCount: 2 })).toEqual({ expenseCount: 2 });
    expect(sanitizeTelemetryProperties("group_created", { hasDescription: false })).toEqual({ hasDescription: false });
  });

  it("recognises keys, tokens, hashes and XDR as sensitive", () => {
    expect(looksSensitive(PUBLIC_KEY)).toBe(true);
    expect(looksSensitive(SECRET_SEED)).toBe(true);
    expect(looksSensitive(JWT_TOKEN)).toBe(true);
    expect(looksSensitive(SIGNED_XDR)).toBe(true);
    expect(looksSensitive(TX_HASH)).toBe(true);
    expect(looksSensitive("user_rejected")).toBe(false);
    expect(looksSensitive("percentage")).toBe(false);
  });
});

describe("telemetryErrorCode", () => {
  it("maps wallet and API errors to coarse categories without reading messages", () => {
    expect(telemetryErrorCode({ code: "user_rejected", message: SECRET_SEED })).toBe("user_rejected");
    expect(telemetryErrorCode({ name: "NetworkMismatchError" })).toBe("network_mismatch");
    expect(telemetryErrorCode({ name: "ApiRequestError", status: 401, code: "UNAUTHORIZED" })).toBe("unauthorized");
    expect(telemetryErrorCode({ name: "ApiRequestError", status: 422, code: "BAD" })).toBe("validation");
    expect(telemetryErrorCode({ name: "ApiRequestError", status: 0, code: "NETWORK" })).toBe("network");
    expect(telemetryErrorCode({ name: "AbortError" })).toBe("timeout");
    expect(telemetryErrorCode(new Error(PUBLIC_KEY))).toBe("unknown");
    expect(telemetryErrorCode("boom")).toBe("unknown");
    expect(telemetryErrorCode(null)).toBe("unknown");
  });
});
