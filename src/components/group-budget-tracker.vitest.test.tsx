import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { GroupBudgetTracker } from "./GroupBudgetTracker";
import { useGroupBudgetStore } from "@/lib/group-budget-store";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

function renderTracker(
  props: Partial<Parameters<typeof GroupBudgetTracker>[0]> = {}
) {
  return render(
    <GroupBudgetTracker
      groupId="g1"
      expenses={[]}
      isAdmin={false}
      {...props}
    />
  );
}

describe("GroupBudgetTracker", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useGroupBudgetStore.setState({ budgets: {} });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing for members when no budget is configured", () => {
    renderTracker({ isAdmin: false });
    expect(screen.queryByText(/group budget/i)).not.toBeInTheDocument();
  });

  it("offers the setup form to admins when no budget is configured", () => {
    renderTracker({ isAdmin: true });
    expect(screen.getByText(/set a group budget/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save budget/i })).toBeInTheDocument();
  });

  it("saves a budget from the admin form", () => {
    renderTracker({ isAdmin: true });
    fireEvent.change(screen.getByLabelText(/limit/i), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save budget/i }));
    expect(useGroupBudgetStore.getState().budgets.g1.limit).toBe(500);
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("500")
    );
  });

  it("renders the progress bar with the consumed percentage", () => {
    useGroupBudgetStore.setState({
      budgets: {
        g1: { limit: 100, currency: "USD", warned: [] },
      },
    });
    renderTracker({
      isAdmin: false,
      assetCode: "USDC",
      expenses: [{ amount: "50", category: null }],
    });
    expect(screen.getByRole("progressbar", { name: /group budget used/i })).toHaveAttribute(
      "aria-valuenow",
      "50"
    );
    expect(screen.getByText("50% used")).toBeInTheDocument();
  });

  it("warns once when spending crosses 80%", () => {
    useGroupBudgetStore.setState({
      budgets: {
        g1: { limit: 100, currency: "USD", warned: [] },
      },
    });
    const { rerender } = renderTracker({
      assetCode: "USDC",
      expenses: [{ amount: "50", category: null }],
    });
    // Below the threshold: no toast yet.
    expect(toast.warning).not.toHaveBeenCalled();

    rerender(
      <GroupBudgetTracker
        groupId="g1"
        expenses={[{ amount: "85", category: null }]}
        assetCode="USDC"
        isAdmin={false}
      />
    );
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining("80%")
    );
    expect(useGroupBudgetStore.getState().budgets.g1.warned).toContain("80");
  });

  it("does not re-toast a threshold already warned", () => {
    useGroupBudgetStore.setState({
      budgets: {
        g1: { limit: 100, currency: "USD", warned: ["80", "100"] },
      },
    });
    const { rerender } = renderTracker({
      assetCode: "USDC",
      expenses: [{ amount: "50", category: null }],
    });
    rerender(
      <GroupBudgetTracker
        groupId="g1"
        expenses={[{ amount: "120", category: null }]}
        assetCode="USDC"
        isAdmin={false}
      />
    );
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("shows the over-budget alert at 100% and more", () => {
    useGroupBudgetStore.setState({
      budgets: {
        g1: { limit: 100, currency: "USD", warned: [] },
      },
    });
    renderTracker({
      assetCode: "USDC",
      expenses: [{ amount: "150", category: null }],
    });
    expect(screen.getByText(/spent its full budget/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100"
    );
  });
});
