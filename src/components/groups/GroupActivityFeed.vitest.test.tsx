import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    description: 'Added expense "Dinner"',
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

vi.mock("@/lib/queries", () => ({
  useGroupActivity: vi.fn(),
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

describe("GroupActivityFeed", () => {
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

  it("renders error state with retry button", async () => {
    const { useGroupActivityPolling } = await import("@/hooks/useGroupActivityPolling");
    const refetch = vi.fn();
    vi.mocked(useGroupActivityPolling).mockReturnValue({
      activities: [],
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
      refetch,
      isPolling: false,
      pollingStalled: false,
    });

    renderWithProviders(<GroupActivityFeed groupId="g1" />);

    expect(screen.getByText(/something went wrong/i)).toBeDefined();
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    retryBtn.click();
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("renders empty state when no activities", async () => {
    const { useGroupActivityPolling } = await import("@/hooks/useGroupActivityPolling");
    vi.mocked(useGroupActivityPolling).mockReturnValue({
      activities: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isPolling: false,
      pollingStalled: false,
    });

    renderWithProviders(<GroupActivityFeed groupId="g1" />);

    expect(screen.getByText("No activity recorded yet")).toBeDefined();
  });

  it("renders activity items with correct details", async () => {
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
    expect(screen.getByText(/Added expense "Dinner"/)).toBeDefined();
    expect(screen.getByText("Settled payment with Alice")).toBeDefined();
    expect(screen.getByText("Expense Added")).toBeDefined();
    expect(screen.getByText("Payment Settled")).toBeDefined();
  });

  it("shows activity count in header", async () => {
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

    expect(screen.getByText("Activity Feed (2)")).toBeDefined();
  });

  it("shows live polling indicator when polling is active", async () => {
    const { useGroupActivityPolling } = await import("@/hooks/useGroupActivityPolling");
    vi.mocked(useGroupActivityPolling).mockReturnValue({
      activities: mockActivities,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isPolling: true,
      pollingStalled: false,
    });

    renderWithProviders(<GroupActivityFeed groupId="g1" polling />);

    expect(screen.getByText("Live")).toBeDefined();
  });

  it("shows polling paused indicator when stalled", async () => {
    const { useGroupActivityPolling } = await import("@/hooks/useGroupActivityPolling");
    vi.mocked(useGroupActivityPolling).mockReturnValue({
      activities: mockActivities,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isPolling: false,
      pollingStalled: true,
    });

    renderWithProviders(<GroupActivityFeed groupId="g1" polling />);

    expect(screen.getByText("Polling paused")).toBeDefined();
  });

  it("does not show polling indicator when polling is off", async () => {
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

    expect(screen.queryByText("Live")).toBeNull();
    expect(screen.queryByText("Polling paused")).toBeNull();
  });

  it("renders a list with aria-label for accessibility", async () => {
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

    expect(screen.getByRole("list", { name: "Group activity events" })).toBeDefined();
  });

  it("marks optimistic events with syncing badge", async () => {
    const { useGroupActivityPolling } = await import("@/hooks/useGroupActivityPolling");
    vi.mocked(useGroupActivityPolling).mockReturnValue({
      activities: [
        {
          ...mockActivities[0],
          isOptimistic: true,
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isPolling: false,
      pollingStalled: false,
    });

    renderWithProviders(<GroupActivityFeed groupId="g1" />);

    expect(screen.getByText("Syncing...")).toBeDefined();
  });
});
