import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { useNetworkStatus } from "./useNetworkStatus";

describe("useNetworkStatus", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  it("reports online status and transitions to offline", () => {
    const { result } = renderHook(() => useNetworkStatus());

    expect(result.current.isOnline).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current.isOnline).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current.isOnline).toBe(true);
  });

  it("marks the API as degraded when the health check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { result } = renderHook(() => useNetworkStatus());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isApiDegraded).toBe(true);
  });
});
