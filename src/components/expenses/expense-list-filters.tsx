"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import type { Expense, GroupMember } from "@/lib/types";

export type ExpenseFilterState = { search: string; payer: string; status: string; asset: string; pageSize: number };

export function ExpenseListFilters({ expenses, members, onChange }: { expenses: Expense[]; members: GroupMember[]; onChange: (state: ExpenseFilterState) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [payer, setPayer] = useState(params.get("payer") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [asset, setAsset] = useState(params.get("asset") ?? "");
  const [pageSize, setPageSize] = useState(Number(params.get("pageSize") ?? 10));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of [["q", search], ["payer", payer], ["status", status], ["asset", asset]] as const) {
        if (value) next.set(key, value); else next.delete(key);
      }
      next.set("pageSize", String(pageSize));
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      onChange({ search, payer, status, asset, pageSize });
    }, search === params.get("q") ? 0 : 300);
    return () => window.clearTimeout(timer);
  }, [asset, pageSize, params, pathname, payer, router, search, status, onChange]);

  const assets = [...new Set(expenses.map((expense) => expense.assetCode))].sort();
  const activeCount = [search, payer, status, asset].filter(Boolean).length;
  function clearAll() { setSearch(""); setPayer(""); setStatus(""); setAsset(""); }

  return (
    <div className="mb-4 space-y-3 rounded-xl border-3 border-ink bg-paper p-4 shadow-brutal-sm" aria-label="Expense filters">
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr] md:items-end">
        <div><Label htmlFor="expense-search">Search</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4" /><Input id="expense-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Expense or payer" /></div></div>
        <div><Label htmlFor="expense-payer">Payer</Label><Select id="expense-payer" value={payer} onChange={(event) => setPayer(event.target.value)}><option value="">Everyone</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.user.displayName}</option>)}</Select></div>
        <div><Label htmlFor="expense-status">Status</Label><Select id="expense-status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Any status</option><option value="pending">Pending</option><option value="settled">Settled</option></Select></div>
        <div><Label htmlFor="expense-asset">Asset</Label><Select id="expense-asset" value={asset} onChange={(event) => setAsset(event.target.value)}><option value="">All assets</option>{assets.map((code) => <option key={code} value={code}>{code}</option>)}</Select></div>
        <div><Label htmlFor="expense-page-size">Per page</Label><Select id="expense-page-size" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></Select></div>
      </div>
      {activeCount > 0 && <div className="flex flex-wrap items-center gap-2 text-xs font-bold"><span>{activeCount} filter{activeCount === 1 ? "" : "s"} active</span><Button size="sm" variant="ghost" onClick={clearAll}><X className="h-3 w-3" /> Clear all</Button></div>}
    </div>
  );
}
