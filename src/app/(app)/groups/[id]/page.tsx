"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useGroupStore } from "@/lib/group-store";
import {
  Landmark,
  ListChecks,
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
import { sortExpensesByDateDesc } from "@/lib/expenses";
import {
  SettleDialog,
  type BulkSettleTarget,
} from "@/components/settle/settle-dialog";
import { BulkSettleBar } from "@/components/settle/bulk-settle-bar";
import {
  filterUnsettledShares,
  sumSelectedAmounts,
} from "@/lib/bulkSettle";
import type { GroupMember } from "@/lib/types";

type Tab = "expenses" | "balances" | "ledger" | "treasury" | "members";

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me, isError: isMeError, error: meError } = useMe();
  const { data: detail, isLoading, isError } = useGroup(id);
  const [tab, setTab] = useState<Tab>("expenses");
  const [addOpen, setAddOpen] = useState(false);
  // Keep the active group id in a tiny client store so sibling routes
  // (e.g. balances, treasury) can reuse it without re-fetching.
  const setSelectedGroup = useGroupStore((s) => s.setSelectedGroup);

  useEffect(() => {
    setSelectedGroup(id);
  }, [id, setSelectedGroup]);

  if (isMeError) {
    throw meError || new Error("Failed to load user information");
  }

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
          {
            id: "expenses",
            label: "Expenses",
            icon: <Receipt className="h-4 w-4" />,
          },
          {
            id: "balances",
            label: "Balances",
            icon: <Scale className="h-4 w-4" />,
          },
          {
            id: "ledger",
            label: "Ledger",
            icon: <ScrollText className="h-4 w-4" />,
          },
          {
            id: "treasury",
            label: "Treasury",
            icon: <Landmark className="h-4 w-4" />,
          },
          {
            id: "members",
            label: "Members",
            icon: <Users className="h-4 w-4" />,
          },
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
  members: GroupMember[];
  onAdd: () => void;
}) {
  const { data, isLoading, isError, refetch } = useExpenses(groupId);

  // Bulk-select state lives here so checkboxes (per card) and the sticky bar
  // can be raised into a single source of truth.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<BulkSettleTarget | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds([]);
  };

  function openBulkDialog(shares: ReturnType<typeof filterUnsettledShares>) {
    if (shares.length === 0) return;
    const first = shares[0];
    setBulkTarget({
      expenseIds: shares.map((s) => s.expenseId),
      rows: shares.map((s) => ({
        expenseId: s.expenseId,
        title: s.expenseTitle,
        amount: s.amount,
      })),
      to: first.payer,
      amount: sumSelectedAmounts(shares),
      assetCode: first.assetCode,
      assetIssuer: first.assetIssuer,
      label: `Settle ${shares.length} expense${
        shares.length === 1 ? "" : "s"
      } with ${first.payer.displayName}`,
    });
    setBulkOpen(true);
  }

  if (isLoading) return <ListSkeleton rows={4} />;

  if (isError) {
    return (
      <EmptyState
        icon={<Receipt className="h-7 w-7 text-red-500" />}
        title="Error loading expenses"
        description="We couldn't load the expenses for this group."
        action={
          <Button onClick={() => refetch()} variant="outline">
            Retry
          </Button>
        }
      />
    );
  }

  const expenses = sortExpensesByDateDesc(data?.expenses ?? []);
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

  // Action area changes when bulk-select is on, mirroring the issue's
  // "Settle" button requirement on the group detail page. The "Add
  // expense" button stays in the page header — this row is only for
  // bulk-select controls.
  const actionArea = selectMode ? (
    <div className="flex items-center justify-end gap-2">
      <Badge tone="paper">{selectedIds.length} selected</Badge>
      <Button variant="outline" size="sm" onClick={exitSelectMode}>
        Cancel
      </Button>
    </div>
  ) : (
    <div className="flex items-center justify-end">
      <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
        <ListChecks className="h-4 w-4" /> Settle in bulk
      </Button>
    </div>
  );

  return (
    <>
      <div className="mb-4 flex items-center justify-between">{actionArea}</div>
      <div className="space-y-3">
        {expenses.map((e) => (
          <ExpenseCard
            key={e.id}
            expense={e}
            groupId={groupId}
            currentUserId={currentUserId}
            members={members}
            selectable={selectMode}
            selected={selectedIds.includes(e.id)}
            onToggleSelect={() => toggleSelect(e.id)}
          />
        ))}
      </div>

      <BulkSettleBar
        expenses={expenses}
        currentUserId={currentUserId}
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
        onProceed={openBulkDialog}
      />

      <SettleDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        groupId={groupId}
        target={null}
        bulkTarget={bulkTarget}
        onSettled={() => {
          setBulkOpen(false);
          setBulkTarget(null);
          exitSelectMode();
        }}
      />
    </>
  );
}
