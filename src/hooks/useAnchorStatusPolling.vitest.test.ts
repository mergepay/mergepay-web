import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useAnchorStatusPolling } from "./useAnchorStatusPolling";
import { api } from "@/lib/api";
import type { AnchorSession } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: {
    getAnchorSession: vi.fn(),
  },
}));

describe("useAnchorStatusPolling Hook (#290)", () => {
  const mockSession: AnchorSession = {
    id: "session-123",
    userId: "user-1",
    anchorName: "MyAnchor",
    kind: "deposit",
    assetCode: "USDC",
    interactiveUrl: "https://anchor.example.com",
    externalTransactionId: null,
    status: "pending_user_transfer_start",
    createdAt: "2026-08-20T10:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("polls getAnchorSession at specified interval when status is active", async () => {
    const updatedSession = { ...mockSession, status: "pending_anchor" as const };
    vi.mocked(api.getAnchorSession).mockResolvedValue({ session: updatedSession });

    const { result } = renderHook(() => useAnchorStatusPolling(mockSession, 1000));

    expect(result.current.isPolling).toBe(true);
    expect(result.current.session?.status).toBe("pending_user_transfer_start");

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(api.getAnchorSession).toHaveBeenCalledWith("session-123");
    expect(result.current.session?.status).toBe("pending_anchor");
  });

  it("stops polling when status becomes terminal (completed/error/refunded)", async () => {
    const terminalSession: AnchorSession = { ...mockSession, status: "completed" };

    const { result } = renderHook(() => useAnchorStatusPolling(terminalSession, 1000));

    expect(result.current.isPolling).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(api.getAnchorSession).not.toHaveBeenCalled();
  });

  it("handles polling errors gracefully and sets isError", async () => {
    vi.mocked(api.getAnchorSession).mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAnchorStatusPolling(mockSession, 1000));

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.isError).toBe(true);
  });
});
