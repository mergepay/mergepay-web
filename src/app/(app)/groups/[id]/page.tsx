"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useGroup, useExpenses, useBalances, useSettlements } from "@/lib/queries";
import { useGroupStore } from "@/lib/group-store";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Plus, Users, Receipt, ArrowLeft, SearchX } from "lucide-react";
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
import { GroupExportMenu } from "@/components/groups/GroupExportMenu";
import { TreasuryView } from "@/components/treasury/TreasuryView";
import { ExpenseListFilters, type ExpenseFilterState } from "@/components/expenses/expense-list-filters";
import { filterExpenses } from "@/lib/expenseFilters";
import { ListSkeleton, GroupHeaderSkeleton, SkeletonBoundary } from "@/components/ui/skeleton";
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
  const setSelectedGroup = useGroupStore((s) => s.setSelectedGroup);

  // The route is the source of truth for which group is active — mirror it into
  // the persisted store so the selection (and the recent-groups list) survives a
  // reload and is readable by views that don't carry the param, e.g. history (#494).
  useEffect(() => {
    if (groupId) setSelectedGroup(groupId);
  }, [groupId, setSelectedGroup]);

  const [filters, setFilters] = useState<ExpenseFilterState>({ keyword: "", payer: "", status: "all", assetCode: "", fromDate: "", toDate: "", pageSize: 10 });
  const [page, setPage] = useState(1);

  const group = groupQuery.data?.group;
  const expenses: Expense[] = useMemo(() => expensesQuery.data?.expenses ?? [], [expensesQuery.data]);
  const balances = balancesQuery.data?.balances ?? [];
  const settlements = settlementsQuery.data?.settlements ?? [];
  const members: GroupMember[] = groupQuery.data?.members ?? [];
  const currentUserId = "user-1"; // Fallback or session user ID
  const isAdmin = true;

  const onFilterChange = useCallback((next: ExpenseFilterState) => {
    setFilters(next);
    setPage(1);
  }, []);

  const filteredExpenses = useMemo(
    () =>
      filterExpenses(expenses, filters).filter(
        (expense) => !filters.payer || expense.payerUserId === filters.payer
      ),
    [expenses, filters]
  );

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
            </Button>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <GroupExportMenu groupId={groupId} groupName={group?.name} expenses={expenses} settlements={settlements} />
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
          <SkeletonBoundary
            isPending={groupQuery.isPending}
            skeleton={<GroupHeaderSkeleton />}
          >
            <div className="rounded-2xl border-3 border-ink bg-paper p-6 shadow-brutal">
              <h1 className="font-display text-2xl uppercase tracking-tight">
                {group?.name ?? "Group"}
              </h1>
              {group?.description && (
                <p className="mt-1 text-sm text-ink/70">{group.description}</p>
              )}
            </div>
          </SkeletonBoundary>
        </ErrorBoundary>

        {/* Settling a non-native asset fails on-chain without a trustline,
            so warn here — before the user starts a settle — and let them
            add it without leaving the group. */}
        {!group?.archived && <TrustlineBanner />}

        <ErrorBoundary>
          <SkeletonBoundary
            isPending={groupQuery.isPending}
            skeleton={<ListSkeleton rows={2} variant="balance" />}
          >
            <GroupBudgetTracker
              groupId={groupId}
              expenses={expenses}
              isAdmin={isAdmin}
            />
          </SkeletonBoundary>
        </ErrorBoundary>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <ErrorBoundary>
              <div className="space-y-4">
                <h2 className="font-display text-sm uppercase tracking-widest text-ink/60">
                  Expenses ({filteredExpenses.length}{filteredExpenses.length !== expenses.length ? ` of ${expenses.length}` : ""})
                </h2>

                <ExpenseListFilters expenses={expenses} members={members} onChange={onFilterChange} />

                {expensesQuery.isPending && (
                  <ListSkeleton rows={5} variant="expense" />
                )}
                {expensesQuery.isError && (
                  <div className="rounded-xl border-3 border-ink bg-flamingo-pale p-6 shadow-brutal-sm">
                    <div className="flex items-start gap-3">
                      <SearchX className="h-6 w-6 text-flamingo mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h3 className="font-bold text-ink mb-1">Failed to load expenses</h3>
                        <p className="text-sm text-ink/70 mb-4">
                          There was a problem fetching the expense list. Please check your connection and try again.
                        </p>
                        <Button size="sm" onClick={() => expensesQuery.refetch()}>
                          Retry
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                {!expensesQuery.isPending && !expensesQuery.isError && visibleExpenses.length === 0 && (
                  expenses.length === 0 ? (
                    <EmptyState
                      icon={<Receipt className="h-7 w-7" />}
                      title="No expenses yet"
                      description="Add the first expense to start splitting costs with this group."
                    />
                  ) : (
                    <EmptyState
                      icon={<SearchX className="h-7 w-7" />}
                      title="No matching expenses"
                      description={
                        filteredExpenses.length > 0
                          ? "No expenses on this page — go back a page."
                          : "Nothing matches these filters. Try a different keyword, currency, status, or date range, or clear the filters."
                      }
                    />
                  )
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
                <TreasuryView
                  groupId={groupId}
                  treasuryEnabled={group.treasuryEnabled}
                  requiredSigners={group.treasuryRequiredSigners}
                  treasuryAccountPublicKey={group.treasuryAccountPublicKey}
                />
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
