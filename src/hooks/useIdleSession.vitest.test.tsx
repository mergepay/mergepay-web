import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIdleSession } from "./useIdleSession";

const TIMEOUT_MS = 10_000;
const WARNING_MS = 3_000;

function renderIdleSession(onTimeout = vi.fn()) {
  return {
    onTimeout,
    ...renderHook(() => useIdleSession(onTimeout, TIMEOUT_MS, WARNING_MS)),
  };
}

describe("useIdleSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("warns before the deadline, then locks exactly once", () => {
    const { result, onTimeout } = renderIdleSession();

    expect(result.current.showWarning).toBe(false);

    act(() => {
      vi.advanceTimersByTime(7_000);
    });
    expect(result.current.showWarning).toBe(true);
    expect(result.current.isIdle).toBe(false);
    expect(result.current.timeLeftMs).toBe(3_000);
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current.isIdle).toBe(true);
    expect(onTimeout).toHaveBeenCalledTimes(1);

    // Ticks after the lock must not fire the callback again.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("restarts the full countdown on user activity", () => {
    const { result, onTimeout } = renderIdleSession();

    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    expect(result.current.showWarning).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("mousemove"));
    });
    expect(result.current.showWarning).toBe(false);
    expect(result.current.timeLeftMs).toBe(TIMEOUT_MS);

    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(onTimeout).not.toHaveBeenCalled();
    expect(result.current.showWarning).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
      vi.advanceTimersByTime(9_000);
    });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("re-evaluates elapsed time on focus without resetting it", () => {
    const { result, onTimeout } = renderIdleSession();

    act(() => {
      vi.advanceTimersByTime(5_000);
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(5_000);
    });

    // Focus is not activity: the elapsed time still reached the deadline.
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(result.current.isIdle).toBe(true);
  });

  it("allows an explicit reset after locking", () => {
    const { result, onTimeout } = renderIdleSession();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);

    act(() => result.current.resetTimers());
    expect(result.current.isIdle).toBe(false);
    expect(result.current.showWarning).toBe(false);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(2);
  });

  it("cleans up its window, document and interval listeners", () => {
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const documentRemove = vi.spyOn(document, "removeEventListener");
    const clearInterval = vi.spyOn(window, "clearInterval");
    const { unmount } = renderIdleSession();

    unmount();

    expect(windowRemove).toHaveBeenCalledWith(
      "mousemove",
      expect.any(Function)
    );
    expect(windowRemove).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(documentRemove).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    );
    expect(clearInterval).toHaveBeenCalled();
  });
});
