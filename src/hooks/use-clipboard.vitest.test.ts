import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { COPIED_FEEDBACK_MS, useClipboard } from "./use-clipboard";
import * as clipboard from "@/lib/clipboard";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/clipboard", () => ({
  copyTextToClipboard: vi.fn(),
}));

const copyTextToClipboard = vi.mocked(clipboard.copyTextToClipboard);

describe("useClipboard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports success and toasts the copied value", async () => {
    copyTextToClipboard.mockResolvedValue(true);
    const { result } = renderHook(() => useClipboard({ what: "public key" }));

    await act(async () => {
      await expect(result.current.copy("GABC")).resolves.toBe(true);
    });

    expect(copyTextToClipboard).toHaveBeenCalledWith("GABC");
    expect(result.current.copied).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Public key copied");
  });

  it("clears the checkmark state after the feedback window", async () => {
    copyTextToClipboard.mockResolvedValue(true);
    const { result } = renderHook(() => useClipboard());

    await act(async () => {
      await result.current.copy("value");
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(COPIED_FEEDBACK_MS);
    });

    expect(result.current.copied).toBe(false);
  });

  it("keeps the state on until the full window elapses", async () => {
    copyTextToClipboard.mockResolvedValue(true);
    const { result } = renderHook(() => useClipboard());

    await act(async () => {
      await result.current.copy("value");
    });

    act(() => {
      vi.advanceTimersByTime(COPIED_FEEDBACK_MS - 1);
    });
    expect(result.current.copied).toBe(true);
  });

  it("falls back to an error toast when every copy mechanism fails", async () => {
    copyTextToClipboard.mockResolvedValue(false);
    const { result } = renderHook(() => useClipboard({ what: "invite link" }));

    await act(async () => {
      await expect(result.current.copy("link")).resolves.toBe(false);
    });

    expect(result.current.copied).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      "Could not copy the invite link. Select and copy it manually."
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not fire a stale success state when a copy fails", async () => {
    copyTextToClipboard.mockResolvedValue(false);
    const { result } = renderHook(() => useClipboard());

    await act(async () => {
      await result.current.copy("value");
    });
    expect(result.current.copied).toBe(false);

    // No success timer should be pending from the failed attempt.
    act(() => {
      vi.advanceTimersByTime(COPIED_FEEDBACK_MS * 2);
    });
    expect(result.current.copied).toBe(false);
  });

  it("restarts the window on a second copy", async () => {
    copyTextToClipboard.mockResolvedValue(true);
    const { result } = renderHook(() => useClipboard());

    await act(async () => {
      await result.current.copy("first");
    });
    act(() => {
      vi.advanceTimersByTime(COPIED_FEEDBACK_MS - 500);
    });

    await act(async () => {
      await result.current.copy("second");
    });
    act(() => {
      vi.advanceTimersByTime(COPIED_FEEDBACK_MS - 500);
    });

    // The first attempt's timer must not have cleared the second attempt's state.
    expect(result.current.copied).toBe(true);
  });

  it("honours showToast: false while still tracking state", async () => {
    copyTextToClipboard.mockResolvedValue(true);
    const { result } = renderHook(() => useClipboard({ showToast: false }));

    await act(async () => {
      await result.current.copy("value");
    });

    expect(result.current.copied).toBe(true);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("uses caller-supplied message overrides", async () => {
    copyTextToClipboard.mockResolvedValue(true);
    const { result } = renderHook(() =>
      useClipboard({ successMessage: "Invite link copied to clipboard" })
    );

    await act(async () => {
      await result.current.copy("link");
    });

    expect(toast.success).toHaveBeenCalledWith("Invite link copied to clipboard");
  });

  it("cancels the pending timer on unmount", async () => {
    copyTextToClipboard.mockResolvedValue(true);
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const { result, unmount } = renderHook(() => useClipboard());

    await act(async () => {
      await result.current.copy("value");
    });

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("does not surface a success state for an empty copy when one fails mid-flight", async () => {
    copyTextToClipboard
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const { result } = renderHook(() => useClipboard());

    await act(async () => {
      await result.current.copy("first");
    });
    expect(result.current.copied).toBe(true);

    await act(async () => {
      await result.current.copy("second");
    });
    expect(result.current.copied).toBe(false);
  });
});
