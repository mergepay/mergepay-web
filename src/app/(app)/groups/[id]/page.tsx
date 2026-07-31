"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useGroupStore } from "@/lib/group-store";
import { ApiRequestError } from "@/lib/api";
import {
  Landmark,
  Plus,
  Receipt,
  Scale,
  ScrollText,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { AddExpenseDialog } from "@/components/expenses/add-expense-dialog";
import { ExpenseCard } from "@/components/expenses/expense-card";
import { BalancesPanel } from "@/components/balances/balances-panel";
import { LedgerPanel } from "@/components/ledger/ledger-panel";
import { TreasuryPanel } from "@/components/treasury/treasury-panel";
import { MembersPanel } from "@/components/groups/members-panel";
import {
  QueryErrorState,
  RefreshingBadge,
  StaleDataNotice,
} from "@/components/ui/query-state";
  SectionBoundary,
  SectionError,
  SectionLoading,
} from "@/components/ui/section";
import { useExpenses, useGroup, useMe } from "@/lib/queries";
import {
  resolveQueryView,
  showsEmptyState,
  showsErrorPanel,
  showsRefreshHint,
  showsSkeleton,
} from "@/lib/queryState";
import { sortExpensesByDateDesc } from "@/lib/expenses";
import { resolveSectionStatus } from "@/lib/sectionState";

type Tab = "expenses" | "balances" | "ledger" | "treasury" | "members";

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const groupQuery = useGroup(id);
  const { data: detail } = groupQuery;
  // The profile request only supplies "(you)" markers; a failure must not
  // take the whole group page down with it.
  const { data: me } = useMe();
  const { data: detail, isLoading, isError, error, refetch } = useGroup(id);
  const [tab, setTab] = useState<Tab>("expenses");
  const [addOpen, setAddOpen] = useState(false);
  const setSelectedGroup = useGroupStore((s) => s.setSelectedGroup);

  useEffect(() => {
    setSelectedGroup(id);
  }, [id, setSelectedGroup]);

  const currentUserId = me.data?.user.id ?? "";

  // A 404 is a different situation from a failed request: one is not
  // recoverable by retrying, the other is.
  const notFound =
    groupQuery.error instanceof ApiRequestError && groupQuery.error.status === 404;

  if (groupQuery.isError && notFound) {
  const currentUserId = me?.user.id ?? "";

  if (isError && !detail) {
    return (
      <SectionError
        subject="this group"
        error={error}
        onRetry={() => refetch()}
      />
    );
  }

  if (groupQuery.isError && !detail) {
    return (
      <QueryErrorState
        icon={<Users className="h-6 w-6" />}
        title="Couldn't load this group"
        description="The request didn't get through. Check your connection and try again."
        onRetry={() => groupQuery.refetch()}
        retrying={groupQuery.isFetching}
      />
    );
  }

  if (!detail) {
    return (
      <SectionLoading label="Loading this group" minHeight="min-h-[24rem]">
        <div className="mb-8 h-10 w-48 animate-pulse rounded-xl bg-ink/10" />
        <ListSkeleton rows={4} />
      </SectionLoading>
    );
  }

  const { group } = detail;

  return (
    <>
      <PageHeader
        back={{ href: "/groups", label: "All groups" }}
        title={group.name}
        description={group.description ?? undefined}
        action={
          tab === "expenses" && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add expense
            </Button>
          )
        }
      />

      {group.archived && (
        <div className="mb-6">
          <Badge tone="paper">This group is archived</Badge>
        </div>
      )}

      <Tabs
        className="mb-6"
        active={tab}
        onChange={(t) => setTab(t as Tab)}
        tabs={[
          { id: "expenses", label: "Expenses", icon: <Receipt className="h-4 w-4" /> },
          { id: "balances", label: "Balances", icon: <Scale className="h-4 w-4" /> },
          { id: "ledger", label: "Ledger", icon: <ScrollText className="h-4 w-4" /> },
          { id: "treasury", label: "Treasury", icon: <Landmark className="h-4 w-4" /> },
          { id: "members", label: "Members", icon: <Users className="h-4 w-4" /> },
        ]}
      />

      {/* Each panel owns its own request and its own failure state, and
          each is wrapped so an unexpected render error is contained to
          the panel instead of blanking the group page. */}
      {tab === "expenses" && (
        <SectionBoundary subject="the expense list">
          <ExpensesTab
            groupId={id}
            currentUserId={currentUserId}
            members={detail.members}
            onAdd={() => setAddOpen(true)}
          />
        </SectionBoundary>
      )}
      {tab === "balances" && (
        <SectionBoundary subject="the balances panel">
          <BalancesPanel groupId={id} currentUserId={currentUserId} />
        </SectionBoundary>
      )}
      {tab === "ledger" && (
        <SectionBoundary subject="the ledger">
          <LedgerPanel groupId={id} />
        </SectionBoundary>
      )}
      {tab === "treasury" && (
        <SectionBoundary subject="the treasury panel">
          <TreasuryPanel group={group} detail={detail} />
        </SectionBoundary>
      )}
      {tab === "members" && (
        <SectionBoundary subject="the member list">
          <MembersPanel detail={detail} currentUserId={currentUserId} />
        </SectionBoundary>
      )}

      <AddExpenseDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        groupId={id}
        members={detail.members}
        currentUserId={currentUserId}
      />
    </>
  );
}

function ExpensesTab({
  groupId,
  currentUserId,
  members,
  onAdd,
}: {
  groupId: string;
  currentUserId: string;
  members: import("@/lib/types").GroupMember[];
  onAdd: () => void;
}) {
  const expensesQuery = useExpenses(groupId);
  const { data } = expensesQuery;
  const expenses = sortExpensesByDateDesc(data?.expenses ?? []);

  const view = resolveQueryView({
    status: expensesQuery.status,
    fetchStatus: expensesQuery.fetchStatus,
    hasData: data !== undefined,
    isEmpty: expenses.length === 0,
    isPlaceholder: expensesQuery.isPlaceholderData,
    enabled: expensesQuery.isEnabled,
  });

  if (showsSkeleton(view)) return <ListSkeleton rows={4} />;

  if (showsErrorPanel(view)) {
    return (
      <QueryErrorState
        icon={<Receipt className="h-6 w-6" />}
        title="Couldn't load expenses"
        description="The request didn't get through. Your expenses are safe — try again in a moment."
        onRetry={() => expensesQuery.refetch()}
        retrying={expensesQuery.isFetching}
  const { data, isLoading, isError, error, refetch } = useExpenses(groupId);

  const status = resolveSectionStatus({
    isLoading,
    isError,
    hasData: data !== undefined,
    isEmpty: (data?.expenses ?? []).length === 0,
  });

  if (status === "loading") {
    return (
      <SectionLoading label="Loading expenses" minHeight="min-h-[18rem]">
        <ListSkeleton rows={4} />
      </SectionLoading>
    );
  }

  if (status === "error") {
    return (
      <SectionError
        subject="the expenses for this group"
        error={error}
        onRetry={() => refetch()}
      />
    );
  }

  if (showsEmptyState(view)) {
    return (
      <EmptyState
        icon={<Receipt className="h-7 w-7" />}
        title="No expenses yet"
        description="Log your first shared bill and let Mergepay split it."
        action={
          <Button onClick={onAdd}>
            <Plus className="h-4 w-4" /> Add expense
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {view === "stale-error" && (
        <StaleDataNotice
          onRetry={() => expensesQuery.refetch()}
          retrying={expensesQuery.isFetching}
        >
          Showing the expenses we loaded earlier — the latest refresh failed.
        </StaleDataNotice>
      )}
      {showsRefreshHint(view) && (
        <div className="flex justify-end">
          <RefreshingBadge show />
        </div>
      )}
      {expenses.map((e) => (
        <ExpenseCard
          key={e.id}
          expense={e}
          groupId={groupId}
          currentUserId={currentUserId}
          members={members}
        />
      ))}
    </div>
  );
}
