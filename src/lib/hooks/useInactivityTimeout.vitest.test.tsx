import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInactivityTimeout } from "./useInactivityTimeout";

vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));

describe("useInactivityTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("warns before timeout and expires exactly once", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useInactivityTimeout(onTimeout, 90_000));
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.showWarning).toBe(true);
    expect(onTimeout).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(60_000));
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(result.current.isIdle).toBe(true);
    act(() => vi.advanceTimersByTime(90_000));
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("resets idle timers for mouse, keyboard, and touch activity", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useInactivityTimeout(onTimeout, 90_000));
    for (const event of ["mousemove", "keydown", "touchstart"]) {
      act(() => {
        vi.advanceTimersByTime(25_000);
        window.dispatchEvent(new Event(event));
      });
      expect(result.current.showWarning).toBe(false);
    }
    act(() => vi.advanceTimersByTime(15_000));
    expect(result.current.showWarning).toBe(false);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("does not silently extend a session while warning is visible", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useInactivityTimeout(onTimeout, 90_000));
    act(() => vi.advanceTimersByTime(30_000));
    act(() => window.dispatchEvent(new Event("mousemove")));
    act(() => vi.advanceTimersByTime(60_000));
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(result.current.isIdle).toBe(true);
  });

  it("extends the session only when Continue is selected", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useInactivityTimeout(onTimeout, 90_000));
    act(() => vi.advanceTimersByTime(30_000));
    act(() => result.current.resetTimers());
    expect(result.current.showWarning).toBe(false);
    act(() => vi.advanceTimersByTime(60_000));
    expect(onTimeout).not.toHaveBeenCalled();
    expect(result.current.showWarning).toBe(true);
  });

  it("expires on resumed activity after a suspended tab exceeds its deadline", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useInactivityTimeout(onTimeout, 90_000));
    // Simulate browser throttling: advance wall-clock without firing timers.
    act(() => vi.setSystemTime(new Date("2026-01-01T00:03:00Z")));
    act(() => window.dispatchEvent(new Event("keydown")));
    expect(result.current.isIdle).toBe(true);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("removes event listeners and pending timers on unmount", () => {
    const onTimeout = vi.fn();
    const { unmount } = renderHook(() => useInactivityTimeout(onTimeout, 90_000));
    unmount();
    act(() => {
      window.dispatchEvent(new Event("touchstart"));
      vi.advanceTimersByTime(200_000);
    });
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
