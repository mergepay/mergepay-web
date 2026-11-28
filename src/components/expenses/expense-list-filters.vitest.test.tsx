import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseListFilters } from "./expense-list-filters";
import {
  DEFAULT_GROUP_EXPENSE_FILTERS,
  GROUP_FILTER_STORAGE_KEY,
  GROUP_FILTER_STORAGE_VERSION,
  useGroupFilterStore,
} from "@/lib/group-filter-store";
import type { Expense, GroupMember } from "@/lib/types";

const replaceMock = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/groups/group-1",
  useSearchParams: () => currentSearchParams,
}));

const USER_1 = {
  id: "u-1",
  stellarPublicKey: "GUSER1",
  displayName: "Ada",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const USER_2 = {
  id: "u-2",
  stellarPublicKey: "GUSER2",
  displayName: "Grace",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const EXPENSES: Expense[] = [
  {
    id: "exp-1",
    groupId: "group-1",
    title: "Dinner",
    description: null,
    amount: "50.00",
    assetCode: "USDC",
    assetIssuer: null,
    payerUserId: "u-1",
    payer: USER_1,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2026-05-01T12:00:00.000Z",
    shares: [],
  },
  {
    id: "exp-2",
    groupId: "group-1",
    title: "Taxi",
    description: null,
    amount: "12.00",
    assetCode: "XLM",
    assetIssuer: null,
    payerUserId: "u-2",
    payer: USER_2,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2026-05-02T12:00:00.000Z",
    shares: [],
  },
];

const MEMBERS: GroupMember[] = [
  {
    id: "m-1",
    groupId: "group-1",
    userId: "u-1",
    role: "admin",
    joinedAt: "2026-01-01T00:00:00.000Z",
    user: USER_1,
  },
  {
    id: "m-2",
    groupId: "group-1",
    userId: "u-2",
    role: "member",
    joinedAt: "2026-01-01T00:00:00.000Z",
    user: USER_2,
  },
];

describe("ExpenseListFilters persistence & cross-tab sync (#829)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    useGroupFilterStore.getState().clearAll();
    replaceMock.mockReset();
    currentSearchParams = new URLSearchParams();
  });

  it("persists chosen status, currency, and sort order across remounts (reload/navigation)", () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <ExpenseListFilters
        groupId="group-1"
        expenses={EXPENSES}
        members={MEMBERS}
        onChange={onChange}
      />
    );

    act(() => {
      vi.runAllTimers();
    });

    fireEvent.click(screen.getByRole("button", { name: /^settled$/i }));
    fireEvent.change(screen.getByRole("combobox", { name: /filter by currency/i }), {
      target: { value: "USDC" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /sort expenses/i }), {
      target: { value: "amount-desc" },
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(useGroupFilterStore.getState().getGroupFilters("group-1")).toMatchObject({
      status: "settled",
      assetCode: "USDC",
      sortOrder: "amount-desc",
    });

    // Simulate navigating away and returning to `/groups/group-1` with no URL params.
    unmount();
    currentSearchParams = new URLSearchParams();
    const onChangeAfterReload = vi.fn();

    render(
      <ExpenseListFilters
        groupId="group-1"
        expenses={EXPENSES}
        members={MEMBERS}
        onChange={onChangeAfterReload}
      />
    );

    act(() => {
      vi.runAllTimers();
    });

    expect(screen.getByRole("button", { name: /^settled$/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("combobox", { name: /filter by currency/i })).toHaveValue("USDC");
    expect(screen.getByRole("combobox", { name: /sort expenses/i })).toHaveValue("amount-desc");
    expect(onChangeAfterReload).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "settled",
        assetCode: "USDC",
        sortOrder: "amount-desc",
      })
    );
  });

  it("syncs filter controls when another tab updates localStorage", () => {
    const onChange = vi.fn();
    render(
      <ExpenseListFilters
        groupId="group-1"
        expenses={EXPENSES}
        members={MEMBERS}
        onChange={onChange}
      />
    );

    act(() => {
      vi.runAllTimers();
    });

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: GROUP_FILTER_STORAGE_KEY,
          newValue: JSON.stringify({
            version: GROUP_FILTER_STORAGE_VERSION,
            state: {
              byGroup: {
                "group-1": {
                  ...DEFAULT_GROUP_EXPENSE_FILTERS,
                  status: "pending",
                  assetCode: "XLM",
                  sortOrder: "oldest",
                  pageSize: 25,
                },
              },
            },
          }),
        })
      );
      vi.runAllTimers();
    });

    expect(screen.getByRole("button", { name: /^pending$/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("combobox", { name: /filter by currency/i })).toHaveValue("XLM");
    expect(screen.getByRole("combobox", { name: /sort expenses/i })).toHaveValue("oldest");
  });

  it("operates cleanly when localStorage throws SecurityError in private mode", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    try {
      const onChange = vi.fn();
      expect(() =>
        render(
          <ExpenseListFilters
            groupId="group-1"
            expenses={EXPENSES}
            members={MEMBERS}
            onChange={onChange}
          />
        )
      ).not.toThrow();

      fireEvent.click(screen.getByRole("button", { name: /^pending$/i }));
      act(() => {
        vi.runAllTimers();
      });

      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "pending" }));
    } finally {
      getItemSpy.mockRestore();
      setItemSpy.mockRestore();
    }
  });
});
