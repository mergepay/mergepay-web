"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/input";
import { ExpenseFilterBar, type ActivityFilters } from "@/components/expenses/ExpenseFilterBar";
import type { ExpenseFilterValues, ExpenseStatusFilter } from "@/lib/expenseFilters";
import {
  DEFAULT_GROUP_EXPENSE_FILTERS,
  EXPENSE_SORT_ORDERS,
  VALID_PAGE_SIZES,
  subscribeGroupFilterStorageSync,
  useGroupFilterStore,
  type ExpenseSortOrder,
  type GroupExpenseFilterPreferences,
} from "@/lib/group-filter-store";
import type { Expense, GroupMember } from "@/lib/types";

export type ExpenseFilterState = ExpenseFilterValues & {
  payer: string;
  pageSize: number;
  sortOrder: ExpenseSortOrder;
};

const fieldLabel = "mb-1 block font-display text-xs uppercase tracking-widest text-ink";

const URL_FILTER_KEYS = ["q", "payer", "status", "asset", "from", "to", "sort", "pageSize"] as const;

function readStatus(value: string | null): ExpenseStatusFilter {
  return value === "settled" || value === "pending" ? value : "all";
}

function readSortOrder(value: string | null): ExpenseSortOrder {
  return value && (EXPENSE_SORT_ORDERS as readonly string[]).includes(value)
    ? (value as ExpenseSortOrder)
    : DEFAULT_GROUP_EXPENSE_FILTERS.sortOrder;
}

function readPageSize(value: string | null): number {
  const parsed = Number(value);
  return VALID_PAGE_SIZES.includes(parsed) ? parsed : DEFAULT_GROUP_EXPENSE_FILTERS.pageSize;
}

function hasExplicitFilterParams(params: URLSearchParams): boolean {
  return URL_FILTER_KEYS.some((key) => params.has(key));
}

function readFiltersFromParams(params: URLSearchParams): GroupExpenseFilterPreferences {
  return {
    keyword: params.get("q") ?? "",
    payer: params.get("payer") ?? "",
    status: readStatus(params.get("status")),
    assetCode: params.get("asset") ?? "",
    fromDate: params.get("from") ?? "",
    toDate: params.get("to") ?? "",
    pageSize: readPageSize(params.get("pageSize")),
    sortOrder: readSortOrder(params.get("sort")),
  };
}

/**
 * Group-page wrapper around the reusable `ExpenseFilterBar` (#356, #829):
 * persists per-group filter criteria and view preferences in `localStorage` via
 * `useGroupFilterStore` (with safe private-browsing fallbacks and cross-tab
 * synchronization) while mirroring active filters into the URL.
 */
export function ExpenseListFilters({
  groupId,
  expenses,
  members,
  onChange,
}: {
  groupId?: string;
  expenses: Expense[];
  members: GroupMember[];
  onChange: (state: ExpenseFilterState) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const id = useId();

  const initialFromUrl = readFiltersFromParams(params);
  const [filters, setFilters] = useState<ActivityFilters>(() => ({
    keyword: initialFromUrl.keyword,
    status: initialFromUrl.status,
    assetCode: initialFromUrl.assetCode,
    fromDate: initialFromUrl.fromDate,
    toDate: initialFromUrl.toDate,
  }));
  const [payer, setPayer] = useState(initialFromUrl.payer);
  const [pageSize, setPageSize] = useState(initialFromUrl.pageSize);
  const [sortOrder, setSortOrder] = useState<ExpenseSortOrder>(initialFromUrl.sortOrder);

  // Track whether localStorage hydration for the current groupId has completed
  // so we never overwrite persisted preferences with defaults on first mount.
  const hydratedGroupRef = useRef<string | null>(null);

  useEffect(() => {
    if (!groupId) {
      hydratedGroupRef.current = "";
      return;
    }
    const urlHasParams = hasExplicitFilterParams(params);
    if (!urlHasParams) {
      // Re-sync from storage in case another tab updated before this mount.
      useGroupFilterStore.getState().syncFromStorage();
      const restored = useGroupFilterStore.getState().getGroupFilters(groupId);
      setFilters({
        keyword: restored.keyword,
        status: restored.status,
        assetCode: restored.assetCode,
        fromDate: restored.fromDate,
        toDate: restored.toDate,
      });
      setPayer(restored.payer);
      setPageSize(restored.pageSize);
      setSortOrder(restored.sortOrder);
    }
    hydratedGroupRef.current = groupId;
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-tab synchronization: reflect updates written in other tabs/windows.
  useEffect(() => {
    if (!groupId) return;
    return subscribeGroupFilterStorageSync((byGroup) => {
      const synced = byGroup[groupId] ?? DEFAULT_GROUP_EXPENSE_FILTERS;
      setFilters({
        keyword: synced.keyword,
        status: synced.status,
        assetCode: synced.assetCode,
        fromDate: synced.fromDate,
        toDate: synced.toDate,
      });
      setPayer(synced.payer);
      setPageSize(synced.pageSize);
      setSortOrder(synced.sortOrder);
    });
  }, [groupId]);

  const keyword = filters.keyword ?? "";
  const status = filters.status ?? "all";
  const asset = filters.assetCode ?? "";
  const fromDate = filters.fromDate ?? "";
  const toDate = filters.toDate ?? "";

  useEffect(() => {
    // Typing in the search box is debounced; every other control applies immediately.
    const timer = window.setTimeout(() => {
      const nextState: ExpenseFilterState = {
        keyword,
        payer,
        status,
        assetCode: asset,
        fromDate,
        toDate,
        pageSize,
        sortOrder,
      };

      if (groupId && hydratedGroupRef.current === groupId) {
        useGroupFilterStore.getState().setGroupFilters(groupId, nextState);
      }

      const next = new URLSearchParams(params.toString());
      for (const [key, value] of [
        ["q", keyword],
        ["payer", payer],
        ["status", status === "all" ? "" : status],
        ["asset", asset],
        ["from", fromDate],
        ["to", toDate],
        ["sort", sortOrder === DEFAULT_GROUP_EXPENSE_FILTERS.sortOrder ? "" : sortOrder],
      ] as const) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      next.set("pageSize", String(pageSize));
      next.delete("page");
      const nextQuery = next.toString();
      if (nextQuery !== params.toString()) {
        router.replace(`${pathname}?${nextQuery}`, { scroll: false });
      }
      onChange(nextState);
    }, keyword === (params.get("q") ?? "") ? 0 : 300);
    return () => window.clearTimeout(timer);
  }, [
    asset,
    fromDate,
    groupId,
    keyword,
    onChange,
    pageSize,
    params,
    pathname,
    payer,
    router,
    sortOrder,
    status,
    toDate,
  ]);

  const assets = [...new Set(expenses.map((expense) => expense.assetCode))].sort();
  const extraActiveCount =
    (payer ? 1 : 0) + (sortOrder !== DEFAULT_GROUP_EXPENSE_FILTERS.sortOrder ? 1 : 0);

  return (
    <ExpenseFilterBar
      value={filters}
      onChange={setFilters}
      label="Search and filter expenses"
      searchLabel="Search expenses"
      searchPlaceholder="Search title, memo, or person…"
      showParticipant={false}
      showStatus
      assetCodes={assets}
      extraActiveCount={extraActiveCount}
      onClearExtras={() => {
        setPayer("");
        setSortOrder(DEFAULT_GROUP_EXPENSE_FILTERS.sortOrder);
        setPageSize(DEFAULT_GROUP_EXPENSE_FILTERS.pageSize);
        if (groupId) {
          useGroupFilterStore.getState().resetGroupFilters(groupId);
        }
      }}
      className="mb-4"
    >
      <div className="min-w-0">
        <label htmlFor={`${id}-payer`} className={fieldLabel}>Payer</label>
        <Select id={`${id}-payer`} value={payer} onChange={(event) => setPayer(event.target.value)}>
          <option value="">Everyone</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.user.displayName}
            </option>
          ))}
        </Select>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${id}-sort`} className={fieldLabel}>Sort by</label>
        <Select
          id={`${id}-sort`}
          aria-label="Sort expenses"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value as ExpenseSortOrder)}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="amount-desc">Highest amount</option>
          <option value="amount-asc">Lowest amount</option>
        </Select>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${id}-page-size`} className={fieldLabel}>Per page</label>
        <Select
          id={`${id}-page-size`}
          value={pageSize}
          onChange={(event) => setPageSize(Number(event.target.value))}
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </Select>
      </div>
    </ExpenseFilterBar>
  );
}
