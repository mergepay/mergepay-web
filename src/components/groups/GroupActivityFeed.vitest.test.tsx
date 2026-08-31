import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { GroupActivityFeed } from "./GroupActivityFeed";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockActivities = [
  {
    id: "act-1",
    groupId: "g1",
    type: "expense_created" as const,
    actor: { id: "u1", displayName: "Alice", avatarUrl: null },
    description: 'Added expense "Dinner at Bistro"',
    amount: "42.50",
    assetCode: "USDC",
    timestamp: new Date().toISOString(),
  },
  {
    id: "act-2",
    groupId: "g1",
    type: "payment_settled" as const,
    actor: { id: "u2", displayName: "Bob", avatarUrl: null },
    description: "Settled payment with Alice",
    amount: "21.25",
    assetCode: "USDC",
    timestamp: new Date(Date.now() - 60_000).toISOString(),
  },
];

vi.mock("@/hooks/useGroupActivityPolling", () => ({
  useGroupActivityPolling: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/groups/g1",
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderWithProviders(
  ui: React.ReactElement,
  client: QueryClient = createQueryClient()
) {
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GroupActivityFeed with Filters and Search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state", async () => {
    const { useGroupActivityPolling } = await import("@/hooks/useGroupActivityPolling");
    vi.mocked(useGroupActivityPolling).mockReturnValue({
      activities: [],
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isPolling: false,
      pollingStalled: false,
    });

    renderWithProviders(<GroupActivityFeed groupId="g1" />);

    expect(screen.getByText(/Loading group activity feed/i)).toBeDefined();
  });

  it("renders activity items and filters by keyword (memo/description)", async () => {
    const { useGroupActivityPolling } = await import("@/hooks/useGroupActivityPolling");
    vi.mocked(useGroupActivityPolling).mockReturnValue({
      activities: mockActivities,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isPolling: false,
      pollingStalled: false,
    });

    renderWithProviders(<GroupActivityFeed groupId="g1" />);

    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText("Bob")).toBeDefined();

    const searchInput = screen.getByLabelText(/search activity by memo or participant/i);
    fireEvent.change(searchInput, { target: { value: "Dinner" } });

    await waitFor(() => {
      expect(screen.getByText(/Dinner at Bistro/)).toBeDefined();
      expect(screen.queryByText(/Settled payment with Alice/)).toBeNull();
    });
  });

  it("filters activities by participant name case-insensitively", async () => {
    const { useGroupActivityPolling } = await import("@/hooks/useGroupActivityPolling");
    vi.mocked(useGroupActivityPolling).mockReturnValue({
      activities: mockActivities,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isPolling: false,
      pollingStalled: false,
    });

    renderWithProviders(<GroupActivityFeed groupId="g1" />);

    const participantInput = screen.getByLabelText(/filter by participant/i);
    fireEvent.change(participantInput, { target: { value: "bob" } });

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeDefined();
      expect(screen.queryByText('Added expense "Dinner at Bistro"')).toBeNull();
    });
  });

  it("shows empty state when filters yield no matches", async () => {
    const { useGroupActivityPolling } = await import("@/hooks/useGroupActivityPolling");
    vi.mocked(useGroupActivityPolling).mockReturnValue({
      activities: mockActivities,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isPolling: false,
      pollingStalled: false,
    });

    renderWithProviders(<GroupActivityFeed groupId="g1" />);

    const searchInput = screen.getByLabelText(/search activity by memo or participant/i);
    fireEvent.change(searchInput, { target: { value: "NonexistentQueryXYZ" } });

    await waitFor(() => {
      expect(screen.getByText("No matching activity found")).toBeDefined();
    });
  });
});
