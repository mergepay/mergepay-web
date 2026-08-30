import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnchorStatusModal } from "./AnchorStatusModal";
import type { AnchorSession } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: {
    getAnchorSession: vi.fn().mockResolvedValue({ session: {} }),
  },
}));

describe("AnchorStatusModal Component (#290)", () => {
  const mockSession: AnchorSession = {
    id: "session-123",
    userId: "user-1",
    anchorName: "TestAnchor",
    kind: "deposit",
    assetCode: "USDC",
    interactiveUrl: "https://anchor.example.com",
    externalTransactionId: null,
    status: "pending_anchor",
    createdAt: "2026-08-20T10:00:00Z",
  };

  it("renders modal header, step progress, and badges correctly", () => {
    render(<AnchorStatusModal session={mockSession} onClose={() => {}} />);

    expect(screen.getByText("Fiat Deposit — USDC")).toBeInTheDocument();
    expect(screen.getByText("TestAnchor")).toBeInTheDocument();
    expect(screen.getByText("pending anchor")).toBeInTheDocument();
    expect(screen.getByText("Awaiting Deposit")).toBeInTheDocument();
    expect(screen.getByText("Anchor Processing")).toBeInTheDocument();
  });

  it("returns null when session is null", () => {
    const { container } = render(<AnchorStatusModal session={null} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
