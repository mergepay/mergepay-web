import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useInactivityTimeout } from "../useInactivityTimeout";

describe("useInactivityTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("triggers warning after timeout minus warning duration", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useInactivityTimeout({
        timeoutMs: 10000,
        warningMs: 3000,
        enabled: true,
        onTimeout,
      })
    );

    expect(result.current.showWarning).toBe(false);

    // Fast-forward to warning threshold (7000ms)
    act(() => {
      vi.advanceTimersByTime(7000);
    });

    expect(result.current.showWarning).toBe(true);
    expect(onTimeout).not.toHaveBeenCalled();

    // Fast-forward remaining 3000ms to total timeout (10000ms)
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("resets timers on activity event", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useInactivityTimeout({
        timeoutMs: 10000,
        warningMs: 3000,
        enabled: true,
        onTimeout,
      })
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.showWarning).toBe(false);

    // Simulate user activity
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove"));
    });

    // Advance another 5000ms (total 10000ms from start, but reset halfway)
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onTimeout).not.toHaveBeenCalled();
    expect(result.current.showWarning).toBe(false);
  });

  it("allows extending session manually", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useInactivityTimeout({
        timeoutMs: 10000,
        warningMs: 3000,
        enabled: true,
        onTimeout,
      })
    );

    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(result.current.showWarning).toBe(true);

    act(() => {
      result.current.extendSession();
    });

    expect(result.current.showWarning).toBe(false);

    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
