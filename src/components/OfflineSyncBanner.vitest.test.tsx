import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OfflineSyncBanner } from "./OfflineSyncBanner";
import { useOfflineStore } from "@/lib/store/offlineStore";

describe("OfflineSyncBanner (#645)", () => {
  beforeEach(() => {
    useOfflineStore.setState({
      isOnline: true,
      drafts: [],
    });
  });

  it("renders nothing when the offline draft queue is empty", () => {
    const { container } = render(<OfflineSyncBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("shows pending draft count and Sync now action when online with queued drafts", () => {
    useOfflineStore.setState({
      isOnline: true,
      drafts: [
        {
          localId: "draft_1",
          groupId: "grp_1",
          request: {
            title: "Lunch",
            amount: "25.00",
            assetCode: "XLM",
            payerUserId: "u1",
            splitType: "equal",
            shares: [{ userId: "u1" }, { userId: "u2" }],
          },
          createdAt: Date.now(),
          status: "pending",
        },
      ],
    });

    render(<OfflineSyncBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(/1 offline draft pending/i);
    expect(screen.getByRole("button", { name: /Sync now/i })).toBeInTheDocument();
  });

  it("reports offline local persistence state and supports dismissal while offline", () => {
    useOfflineStore.setState({
      isOnline: false,
      drafts: [
        {
          localId: "draft_2",
          groupId: "grp_1",
          request: {
            title: "Cab",
            amount: "12.00",
            assetCode: "XLM",
            payerUserId: "u1",
            splitType: "equal",
            shares: [{ userId: "u1" }],
          },
          createdAt: Date.now(),
          status: "pending",
        },
      ],
    });

    render(<OfflineSyncBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(/You're offline/i);
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
