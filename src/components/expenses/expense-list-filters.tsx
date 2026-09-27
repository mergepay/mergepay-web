"use client";

import { useEffect, useId, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/input";
import { ExpenseFilterBar, type ActivityFilters } from "@/components/expenses/ExpenseFilterBar";
import type { ExpenseFilterValues, ExpenseStatusFilter } from "@/lib/expenseFilters";
import type { Expense, GroupMember } from "@/lib/types";

export type ExpenseFilterState = ExpenseFilterValues & { payer: string; pageSize: number };

const fieldLabel = "mb-1 block font-display text-xs uppercase tracking-widest text-ink";

function readStatus(value: string | null): ExpenseStatusFilter {
  return value === "settled" || value === "pending" ? value : "all";
}

/**
 * Group-page wrapper around the reusable `ExpenseFilterBar` (#356): mirrors
 * the filters into the URL (so a filtered view survives reload and can be
 * shared) and adds the page-specific payer and page-size controls.
 */
export function ExpenseListFilters({ expenses, members, onChange }: { expenses: Expense[]; members: GroupMember[]; onChange: (state: ExpenseFilterState) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const id = useId();
  const [filters, setFilters] = useState<ActivityFilters>(() => ({
    keyword: params.get("q") ?? "",
    status: readStatus(params.get("status")),
    assetCode: params.get("asset") ?? "",
    fromDate: params.get("from") ?? "",
    toDate: params.get("to") ?? "",
  }));
  const [payer, setPayer] = useState(params.get("payer") ?? "");
  const [pageSize, setPageSize] = useState(Number(params.get("pageSize") ?? 10));

  const keyword = filters.keyword ?? "";
  const status = filters.status ?? "all";
  const asset = filters.assetCode ?? "";
  const fromDate = filters.fromDate ?? "";
  const toDate = filters.toDate ?? "";

  useEffect(() => {
    // Typing in the search box is debounced; every other control applies immediately.
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of [
        ["q", keyword],
        ["payer", payer],
        ["status", status === "all" ? "" : status],
        ["asset", asset],
        ["from", fromDate],
        ["to", toDate],
      ] as const) {
        if (value) next.set(key, value); else next.delete(key);
      }
      next.set("pageSize", String(pageSize));
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      onChange({ keyword, payer, status, assetCode: asset, fromDate, toDate, pageSize });
    }, keyword === (params.get("q") ?? "") ? 0 : 300);
    return () => window.clearTimeout(timer);
  }, [asset, fromDate, keyword, pageSize, params, pathname, payer, router, status, toDate, onChange]);

  const assets = [...new Set(expenses.map((expense) => expense.assetCode))].sort();

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
      extraActiveCount={payer ? 1 : 0}
      onClearExtras={() => setPayer("")}
      className="mb-4"
    >
      <div className="min-w-0">
        <label htmlFor={`${id}-payer`} className={fieldLabel}>Payer</label>
        <Select id={`${id}-payer`} value={payer} onChange={(event) => setPayer(event.target.value)}>
          <option value="">Everyone</option>
          {members.map((member) => <option key={member.userId} value={member.userId}>{member.user.displayName}</option>)}
        </Select>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${id}-page-size`} className={fieldLabel}>Per page</label>
        <Select id={`${id}-page-size`} value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </Select>
      </div>
    </ExpenseFilterBar>
  );
}
