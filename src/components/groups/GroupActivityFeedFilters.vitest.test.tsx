import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { GroupActivityFeed } from "./GroupActivityFeed";
import { useGroupActivityPolling } from "@/hooks/useGroupActivityPolling";
import type { GroupActivityEvent } from "@/lib/types";

/**
 * Advanced search and filtering on the group activity feed (#815): memo tags,
 * event types, a shareable URL, and an empty state that offers a way back.
 */

const replace = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace }),
  usePathname: () => "/groups/g1",
}));

vi.mock("@/hooks/useGroupActivityPolling", () => ({ useGroupActivityPolling: vi.fn() }));

const now = Date.now();
const activities: GroupActivityEvent[] = [
  {
    id: "a1",
    groupId: "g1",
    type: "expense_created",
    actor: { id: "u1", displayName: "Alice", avatarUrl: null },
    description: 'Added expense "Dinner at Bistro"',
    amount: "42.50",
    assetCode: "USDC",
    memo: "MP:dinner-8f3a",
    timestamp: new Date(now).toISOString(),
  },
  {
    id: "a2",
    groupId: "g1",
    type: "payment_settled",
    actor: { id: "u2", displayName: "Bob", avatarUrl: null },
    description: "Settled payment with Alice",
    amount: "21.25",
    assetCode: "XLM",
    memo: "MP:settle-77",
    timestamp: new Date(now - 60_000).toISOString(),
  },
  {
    id: "a3",
    groupId: "g1",
    type: "member_joined",
    actor: { id: "u3", displayName: "Chidi", avatarUrl: null },
    description: "Joined the group as member",
    timestamp: new Date(now - 120_000).toISOString(),
  },
];

function mockFeed(events: GroupActivityEvent[] = activities) {
  vi.mocked(useGroupActivityPolling).mockReturnValue({
    activities: events,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isPolling: false,
    pollingStalled: false,
  });
}

const list = () => screen.queryByRole("list", { name: "Group activity events" });
const visibleDescriptions = () =>
  list() ? within(list()!).getAllByRole("listitem").map((li) => li.textContent ?? "") : [];

describe("GroupActivityFeed advanced filters (#815)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search = "";
    mockFeed();
  });

  it("shows each event's memo tag", () => {
    render(<GroupActivityFeed groupId="g1" />);
    expect(screen.getAllByTestId("activity-memo").map((el) => el.textContent)).toEqual([
      "MP:dinner-8f3a",
      "MP:settle-77",
    ]);
  });

  it("filters by memo tag from the memo field", () => {
    render(<GroupActivityFeed groupId="g1" />);
    fireEvent.change(screen.getByLabelText("Filter by memo tag"), { target: { value: "settle" } });

    const shown = visibleDescriptions();
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain("Settled payment with Alice");
    expect(screen.getByTestId("activity-count")).toHaveTextContent("(1 of 3)");
  });

  it("clicking a memo chip narrows the feed to that memo", () => {
    render(<GroupActivityFeed groupId="g1" />);
    fireEvent.click(screen.getByRole("button", { name: "Show only activity with memo MP:dinner-8f3a" }));

    expect(screen.getByLabelText("Filter by memo tag")).toHaveValue("MP:dinner-8f3a");
    expect(visibleDescriptions()).toHaveLength(1);
  });

  it("finds events by memo through the main search box too", () => {
    render(<GroupActivityFeed groupId="g1" />);
    fireEvent.change(screen.getByLabelText(/search activity by memo or participant/i), {
      target: { value: "dinner-8f3a" },
    });
    expect(visibleDescriptions()).toHaveLength(1);
    expect(visibleDescriptions()[0]).toContain("Dinner at Bistro");
  });

  it("toggles event types as pressed buttons", () => {
    render(<GroupActivityFeed groupId="g1" />);
    const settlements = screen.getByRole("button", { name: "Settlements" });
    expect(settlements).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(settlements);
    expect(settlements).toHaveAttribute("aria-pressed", "true");
    expect(visibleDescriptions()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Members" }));
    expect(visibleDescriptions()).toHaveLength(2);

    fireEvent.click(settlements);
    fireEvent.click(screen.getByRole("button", { name: "Members" }));
    expect(visibleDescriptions()).toHaveLength(3);
  });

  it("excludes events with no asset once a currency is chosen", () => {
    render(<GroupActivityFeed groupId="g1" />);
    fireEvent.change(screen.getByLabelText("Filter by currency"), { target: { value: "XLM" } });
    const shown = visibleDescriptions();
    expect(shown).toHaveLength(1);
    expect(shown[0]).not.toContain("Joined the group");
  });

  it("shows a helpful empty state with a reset action when nothing matches", () => {
    render(<GroupActivityFeed groupId="g1" />);
    fireEvent.change(screen.getByLabelText(/search activity by memo or participant/i), {
      target: { value: "nothing-like-this" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Settlements" }));

    const empty = screen.getByTestId("activity-empty-filtered");
    expect(within(empty).getByText("No matching activity found")).toBeInTheDocument();
    expect(empty).toHaveTextContent("None of the 3 events in this group match your 2 filters");

    fireEvent.click(within(empty).getByRole("button", { name: /clear all filters/i }));
    expect(visibleDescriptions()).toHaveLength(3);
    expect(screen.getByLabelText(/search activity by memo or participant/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: "Settlements" })).toHaveAttribute("aria-pressed", "false");
  });

  it("the filter bar's Clear also resets memo and type filters", () => {
    render(<GroupActivityFeed groupId="g1" />);
    fireEvent.change(screen.getByLabelText("Filter by memo tag"), { target: { value: "MP:" } });
    fireEvent.click(screen.getByRole("button", { name: "Expenses" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear (2)" }));

    expect(screen.getByLabelText("Filter by memo tag")).toHaveValue("");
    expect(visibleDescriptions()).toHaveLength(3);
  });

  it("says there is no activity yet, without a reset, when the group is empty", () => {
    mockFeed([]);
    render(<GroupActivityFeed groupId="g1" />);
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.queryByTestId("activity-reset-filters")).not.toBeInTheDocument();
  });

  it("restores filters from a shared link", () => {
    search = "memo=settle&type=payment_settled";
    render(<GroupActivityFeed groupId="g1" />);
    expect(screen.getByLabelText("Filter by memo tag")).toHaveValue("settle");
    expect(screen.getByRole("button", { name: "Settlements" })).toHaveAttribute("aria-pressed", "true");
    expect(visibleDescriptions()).toHaveLength(1);
    // Already in sync with the URL: nothing to replace.
    expect(replace).not.toHaveBeenCalled();
  });

  it("writes filters to the URL, keeping unrelated params", () => {
    search = "tab=activity";
    render(<GroupActivityFeed groupId="g1" />);
    fireEvent.change(screen.getByLabelText("Filter by memo tag"), { target: { value: "MP:dinner" } });
    expect(replace).toHaveBeenLastCalledWith("/groups/g1?tab=activity&memo=MP%3Adinner", { scroll: false });
  });
});
