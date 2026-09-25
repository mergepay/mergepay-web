import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  effectiveActivityPollInterval,
  DEFAULT_ACTIVITY_POLL_INTERVAL_MS,
  ACTIVITY_POLL_MAX_FAILURES,
} from "./useGroupActivityPolling";

// ---------------------------------------------------------------------------
// Pure helper tests
// ---------------------------------------------------------------------------

describe("effectiveActivityPollInterval", () => {
  it("returns the configured interval when everything is fine", () => {
    expect(
      effectiveActivityPollInterval({
        configuredMs: 10_000,
        documentHidden: false,
        pollingStalled: false,
        isError: false,
      })
    ).toBe(10_000);
  });

  it("returns false when polling is disabled (configuredMs = false)", () => {
    expect(
      effectiveActivityPollInterval({
        configuredMs: false,
        documentHidden: false,
        pollingStalled: false,
        isError: false,
      })
    ).toBe(false);
  });

  it("returns false when configuredMs <= 0", () => {
    expect(
      effectiveActivityPollInterval({
        configuredMs: 0,
        documentHidden: false,
        pollingStalled: false,
        isError: false,
      })
    ).toBe(false);
  });

  it("returns false when the document is hidden", () => {
    expect(
      effectiveActivityPollInterval({
        configuredMs: 15_000,
        documentHidden: true,
        pollingStalled: false,
        isError: false,
      })
    ).toBe(false);
  });

  it("returns false when polling is stalled", () => {
    expect(
      effectiveActivityPollInterval({
        configuredMs: 15_000,
        documentHidden: false,
        pollingStalled: true,
        isError: false,
      })
    ).toBe(false);
  });

  it("returns false when there is an error", () => {
    expect(
      effectiveActivityPollInterval({
        configuredMs: 15_000,
        documentHidden: false,
        pollingStalled: false,
        isError: true,
      })
    ).toBe(false);
  });

  it("returns false when multiple blockers are present", () => {
    expect(
      effectiveActivityPollInterval({
        configuredMs: 15_000,
        documentHidden: true,
        pollingStalled: true,
        isError: true,
      })
    ).toBe(false);
  });

  it("returns the default interval for default values", () => {
    expect(
      effectiveActivityPollInterval({
        configuredMs: DEFAULT_ACTIVITY_POLL_INTERVAL_MS,
        documentHidden: false,
        pollingStalled: false,
        isError: false,
      })
    ).toBe(DEFAULT_ACTIVITY_POLL_INTERVAL_MS);
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("useGroupActivityPolling constants", () => {
  it("has a reasonable default polling interval", () => {
    expect(DEFAULT_ACTIVITY_POLL_INTERVAL_MS).toBeGreaterThan(0);
    expect(DEFAULT_ACTIVITY_POLL_INTERVAL_MS).toBeLessThanOrEqual(60_000);
  });

  it("has a reasonable max failure count", () => {
    expect(ACTIVITY_POLL_MAX_FAILURES).toBeGreaterThanOrEqual(3);
    expect(ACTIVITY_POLL_MAX_FAILURES).toBeLessThanOrEqual(20);
  });
});
