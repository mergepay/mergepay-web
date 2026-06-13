"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
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
import { useExpenses, useGroup, useMe } from "@/lib/queries";

type Tab = "expenses" | "balances" | "ledger" | "treasury" | "members";

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const { data: detail, isLoading, isError } = useGroup(id);
  const [tab, setTab] = useState<Tab>("expenses");
  const [addOpen, setAddOpen] = useState(false);

  const currentUserId = me?.user.id ?? "";

  if (isError) {
    return (
      <EmptyState
        icon={<Users className="h-7 w-7" />}
        title="Group not found"
        description="You may not have access to this group, or it doesn't exist."
        action={
          <Button onClick={() => history.back()} variant="outline">
            Go back
          </Button>
        }
      />
    );
  }

  if (isLoading || !detail) {
    return (
      <>
        <div className="mb-8 h-10 w-48 animate-pulse rounded-xl bg-ink/10" />
        <ListSkeleton rows={4} />
      </>
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

      {tab === "expenses" && (
        <ExpensesTab
          groupId={id}
          currentUserId={currentUserId}
          members={detail.members}
          onAdd={() => setAddOpen(true)}
        />
      )}
      {tab === "balances" && (
        <BalancesPanel groupId={id} currentUserId={currentUserId} />
      )}
      {tab === "ledger" && <LedgerPanel groupId={id} />}
      {tab === "treasury" && <TreasuryPanel group={group} detail={detail} />}
      {tab === "members" && (
        <MembersPanel detail={detail} currentUserId={currentUserId} />
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
  const { data, isLoading } = useExpenses(groupId);

  if (isLoading) return <ListSkeleton rows={4} />;

  const expenses = data?.expenses ?? [];
  if (expenses.length === 0) {
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
