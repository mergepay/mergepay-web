import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GroupList } from "./GroupList";
import type { GroupSummary } from "@/lib/types";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock router / Link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("GroupList Component", () => {
  it("renders loading skeleton when isLoading is true", () => {
    renderWithClient(<GroupList isLoading={true} groups={[]} />);
    expect(screen.getByTestId("group-list-loading")).toBeInTheDocument();
  });

  it("renders placeholder empty state when groups array is empty", () => {
    renderWithClient(<GroupList isLoading={false} groups={[]} />);
    expect(screen.getByTestId("group-list-empty")).toBeInTheDocument();
    expect(screen.getByText("No groups yet")).toBeInTheDocument();
    expect(
      screen.getByText("You haven't joined any groups yet. Create a new group to get started!")
    ).toBeInTheDocument();
    expect(screen.getByTestId("empty-create-group-btn")).toBeInTheDocument();
  });

  it("triggers onCreateGroup callback when create group button is clicked", () => {
    const handleCreate = vi.fn();
    renderWithClient(<GroupList isLoading={false} groups={[]} onCreateGroup={handleCreate} />);
    const createBtn = screen.getByTestId("empty-create-group-btn");
    fireEvent.click(createBtn);
    expect(handleCreate).toHaveBeenCalledTimes(1);
  });

  it("renders group cards and hides placeholder when groups are present", () => {
    const mockGroups: GroupSummary[] = [
      {
        id: "grp-1",
        name: "Weekend Trip",
        description: "Mountain cabin getaway",
        createdByUserId: "usr-1",
        treasuryEnabled: false,
        treasuryAccountPublicKey: null,
        treasuryRequiredSigners: null,
        archived: false,
        createdAt: "2026-09-01T00:00:00.000Z",
        memberCount: 4,
        yourNet: "0.0000000",
        netAssetCode: "XLM",
      },
      {
        id: "grp-2",
        name: "Apartment Rent",
        description: "Monthly bills and utilities",
        createdByUserId: "usr-2",
        treasuryEnabled: true,
        treasuryAccountPublicKey: "GABC...",
        treasuryRequiredSigners: 2,
        archived: false,
        createdAt: "2026-09-02T00:00:00.000Z",
        memberCount: 3,
        yourNet: "10.0000000",
        netAssetCode: "USDC",
      },
    ];

    renderWithClient(<GroupList isLoading={false} groups={mockGroups} />);
    expect(screen.queryByTestId("group-list-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("group-list-grid")).toBeInTheDocument();
    expect(screen.getByText("Weekend Trip")).toBeInTheDocument();
    expect(screen.getByText("Apartment Rent")).toBeInTheDocument();
    expect(screen.getByText("4 members")).toBeInTheDocument();
    expect(screen.getByText("3 members")).toBeInTheDocument();
  });
});
