"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useGroup, useExpenses, useBalances, useSettlements } from "@/lib/queries";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Plus, Users, Receipt, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AddExpenseDialog } from "@/components/expenses/add-expense-dialog";
import { SettleDialog } from "@/components/settle/settle-dialog";
import { InviteModal } from "@/components/groups/InviteModal";
import { BalancesPanel } from "@/components/balances/balances-panel";
import { ExpenseCard } from "@/components/expenses/expense-card";
import { GroupActivityFeed } from "@/components/groups/GroupActivityFeed";
import { GroupBudgetTracker } from "@/components/GroupBudgetTracker";
import { ExportGroupStatementButton } from "@/components/ExportGroupStatementButton";
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

  const group = groupQuery.data?.group;
  const expenses: Expense[] = expensesQuery.data?.expenses ?? [];
  const balances = balancesQuery.data?.balances ?? [];
  const settlements = settlementsQuery.data?.settlements ?? [];
  const members: GroupMember[] = group?.members ?? [];
  const currentUserId = "user-1"; // Fallback or session user ID
  const isAdmin = true;

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
          <div className="rounded-2xl border-3 border-ink bg-paper p-6 shadow-brutal">
            <h1 className="font-display text-2xl uppercase tracking-tight">
              {group?.name ?? "Loading group..."}
            </h1>
            {group?.description && (
              <p className="mt-1 text-sm text-ink/70">{group.description}</p>
            )}
          </div>
        </ErrorBoundary>

        <ErrorBoundary>
          <GroupBudgetTracker
            groupId={groupId}
            expenses={expenses}
            isAdmin={isAdmin}
          />
        </ErrorBoundary>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <ErrorBoundary>
              <div className="space-y-4">
                <h2 className="font-display text-sm uppercase tracking-widest text-ink/60">
                  Expenses ({expenses.length})
                </h1>
                {expensesQuery.isLoading && <p>Loading expenses...</p>}
                {expensesQuery.isError && (
                  <div className="rounded-xl border-2 border-ink bg-flamingo-pale p-4">
                    <p>Could not load expenses.</p>
                    <Button size="sm" onClick={() => expensesQuery.refetch()} className="mt-2">
                      Retry
                    </Button>
                  </div>
                )}
                {expenses.map((expense: Expense) => (
                  <ErrorBoundary key={expense.id}>
                    <ExpenseCard
                      expense={expense}
                      groupId={groupId}
                      currentUserId={currentUserId}
                      members={members}
                    />
                  </ErrorBoundary>
                ))}
              </div>
            </ErrorBoundary>
          </div>

          <div className="space-y-6">
            <ErrorBoundary>
              <BalancesPanel
                groupId={groupId}
                balances={balances}
                members={members}
                currentUserId={currentUserId}
              />
            </ErrorBoundary>

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
        />

        <InviteModal
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          groupId={groupId}
        />
      </div>
    </ErrorBoundary>
  );
}
