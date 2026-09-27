import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CopyButton from "./CopyButton";
import * as clipboard from "@/lib/clipboard";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/clipboard", () => ({
  copyTextToClipboard: vi.fn(),
}));

const copyTextToClipboard = vi.mocked(clipboard.copyTextToClipboard);

describe("CopyButton", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes the write through the clipboard helper, not navigator.clipboard", async () => {
    copyTextToClipboard.mockResolvedValue(true);
    render(<CopyButton text="GABC123" what="public key" />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(copyTextToClipboard).toHaveBeenCalledWith("GABC123")
    );
    expect(toast.success).toHaveBeenCalledWith("Public key copied");
  });

  it("shows the checkmark and a live-region confirmation on success", async () => {
    copyTextToClipboard.mockResolvedValue(true);
    const { container } = render(
      <CopyButton text="invite" label="Copy" what="invite link" />
    );

    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Copy invite link"
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-label",
        "invite link copied"
      )
    );
    expect(screen.getByText("Copied")).toBeInTheDocument();
    expect(
      screen.getByText("invite link copied to clipboard")
    ).toBeInTheDocument();
    // The icon swaps from Copy to Check.
    expect(container.querySelector(".lucide-check")).not.toBeNull();
  });

  it("falls back gracefully when the clipboard API is unavailable", async () => {
    // Insecure origin / blocked permissions: the helper's legacy path fails
    // too, so the user is told to copy manually instead of being shown a
    // checkmark for a copy that never happened.
    copyTextToClipboard.mockResolvedValue(false);
    render(<CopyButton text="GABC123" what="public key" />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not copy the public key. Select and copy it manually."
      )
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Copy public key"
    );
  });
});
