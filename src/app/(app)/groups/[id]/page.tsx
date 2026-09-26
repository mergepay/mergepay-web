"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useGroup, useExpenses, useBalances, useSettlements } from "@/lib/queries";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Plus, Users, Receipt, ArrowLeft, Search } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AddExpenseDialog } from "@/components/expenses/add-expense-dialog";
import { InviteMemberModal } from "@/components/groups/InviteMemberModal";
import { TrustlineBanner } from "@/components/wallet/TrustlineBanner";
import { BalancesPanel } from "@/components/balances/balances-panel";
import { ExpenseCard } from "@/components/expenses/expense-card";
import { GroupActivityFeed } from "@/components/groups/GroupActivityFeed";
import { GroupBudgetTracker } from "@/components/GroupBudgetTracker";
import { ExportGroupStatementButton } from "@/components/ExportGroupStatementButton";
import { GroupExportButton } from "@/components/groups/GroupExportButton";
import { TreasuryOverview } from "@/components/treasury/TreasuryOverview";
import { ExpenseListFilters, type ExpenseFilterState } from "@/components/expenses/expense-list-filters";
import { ListSkeleton, GroupHeaderSkeleton } from "@/components/ui/skeleton";
import type { Expense, GroupMember } from "@/lib/types";

export default function GroupDetailPage() {
  const params = useParams();
  const groupId = params.id as string;

  const groupQuery = useGroup(groupId);
  const expensesQuery = useExpenses(groupId);
  const balancesQuery = useBalances(groupId);
  const settlementsQuery = useSettlements(groupId);

  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [filters, setFilters] = useState<ExpenseFilterState>({ search: "", payer: "", status: "", asset: "", pageSize: 10 });
  const [page, setPage] = useState(1);

  const group = groupQuery.data?.group;
  const expenses: Expense[] = expensesQuery.data?.expenses ?? [];
  const balances = balancesQuery.data?.balances ?? [];
  const settlements = settlementsQuery.data?.settlements ?? [];
  const members: GroupMember[] = groupQuery.data?.members ?? [];
  const currentUserId = "user-1"; // Fallback or session user ID
  const isAdmin = true;

  const onFilterChange = useCallback((next: ExpenseFilterState) => {
    setFilters(next);
    setPage(1);
  }, []);

  const filteredExpenses = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    return expenses.filter((expense) => {
      const matchesSearch =
        !needle ||
        expense.title.toLowerCase().includes(needle) ||
        expense.payer.displayName.toLowerCase().includes(needle);
      const matchesPayer = !filters.payer || expense.payerUserId === filters.payer;
      const matchesAsset = !filters.asset || expense.assetCode === filters.asset;
      const settled = expense.shares.length > 0 && expense.shares.every((share) => share.status === "settled");
      const matchesStatus = !filters.status || (filters.status === "settled" ? settled : !settled);
      return matchesSearch && matchesPayer && matchesAsset && matchesStatus;
    });
  }, [expenses, filters]);

  const pageCount = Math.max(1, Math.ceil(filteredExpenses.length / filters.pageSize));
  const visibleExpenses = filteredExpenses.slice((page - 1) * filters.pageSize, page * filters.pageSize);

  return (
    <ErrorBoundary onReset={() => {
      groupQuery.refetch();
      expensesQuery.refetch();
      balancesQuery.refetch();
      settlementsQuery.refetch();
    }}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <GroupExportButton groupId={groupId} expenses={expenses} settlements={settlements} />
            <ExportGroupStatementButton groupId={groupId} expenses={expenses} settlements={settlements} />
            <Button variant="outline" onClick={() => setInviteOpen(true)}>
              <Users className="h-4 w-4 mr-1" /> Invite
            </Button>
            <Button onClick={() => setAddExpenseOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Expense
            </Button>
          </div>
        </div>

        <ErrorBoundary>
          {groupQuery.isLoading ? (
            <GroupHeaderSkeleton />
          ) : (
            <div className="rounded-2xl border-3 border-ink bg-paper p-6 shadow-brutal">
              <h1 className="font-display text-2xl uppercase tracking-tight">
                {group?.name ?? "Group"}
              </h1>
              {group?.description && (
                <p className="mt-1 text-sm text-ink/70">{group.description}</p>
              )}
            </div>
          )}
        </ErrorBoundary>

        {/* Settling a non-native asset fails on-chain without a trustline,
            so warn here — before the user starts a settle — and let them
            add it without leaving the group. */}
        {!group?.archived && <TrustlineBanner />}

        <ErrorBoundary>
          {groupQuery.isLoading ? (
            <ListSkeleton rows={2} variant="balance" />
          ) : (
            <GroupBudgetTracker
              groupId={groupId}
              expenses={expenses}
              isAdmin={isAdmin}
            />
          )}
        </ErrorBoundary>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <ErrorBoundary>
              <div className="space-y-4">
                <h2 className="font-display text-sm uppercase tracking-widest text-ink/60">
                  Expenses ({filteredExpenses.length}{filteredExpenses.length !== expenses.length ? ` of ${expenses.length}` : ""})
                </h2>

                <ExpenseListFilters expenses={expenses} members={members} onChange={onFilterChange} />

                {expensesQuery.isLoading && (
                  <ListSkeleton rows={5} variant="expense" />
                )}
                {expensesQuery.isError && (
                  <div className="rounded-xl border-2 border-ink bg-flamingo-pale p-4">
                    <p>Could not load expenses.</p>
                    <Button size="sm" onClick={() => expensesQuery.refetch()} className="mt-2">
                      Retry
                    </Button>
                  </div>
                )}
                {!expensesQuery.isLoading && !expensesQuery.isError && visibleExpenses.length === 0 && (
                  <EmptyState
                    icon={<Search className="h-7 w-7" />}
                    title="No expenses found"
                    description={filteredExpenses.length > 0 ? "No expenses match these filters on this page." : "No expenses recorded yet."}
                  />
                )}
                {visibleExpenses.map((expense: Expense) => (
                  <motion.div
                    key={expense.id}
                    layout
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  >
                    <ErrorBoundary>
                      <ExpenseCard
                        expense={expense}
                        groupId={groupId}
                        currentUserId={currentUserId}
                        members={members}
                      />
                    </ErrorBoundary>
                  </motion.div>
                ))}
                {pageCount > 1 && (
                  <div className="flex items-center justify-center gap-3">
                    <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</Button>
                    <span className="text-xs font-bold">Page {page} of {pageCount}</span>
                    <Button size="sm" variant="outline" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}>Next</Button>
                  </div>
                )}
              </div>
            </ErrorBoundary>
          </div>

          <div className="space-y-6">
            <ErrorBoundary>
              <BalancesPanel
                groupId={groupId}
                currentUserId={currentUserId}
              />
            </ErrorBoundary>

            {group?.treasuryEnabled && (
              <ErrorBoundary>
                <TreasuryOverview groupId={groupId} />
              </ErrorBoundary>
            )}

            <ErrorBoundary>
              <GroupActivityFeed groupId={groupId} polling={true} />
            </ErrorBoundary>
          </div>
        </div>

        <AddExpenseDialog
          open={addExpenseOpen}
          onClose={() => setAddExpenseOpen(false)}
          groupId={groupId}
          members={members}
          currentUserId={currentUserId}
        />

        <InviteMemberModal
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          groupId={groupId}
          groupName={group?.name}
        />
      </div>
    </ErrorBoundary>
  );
}
