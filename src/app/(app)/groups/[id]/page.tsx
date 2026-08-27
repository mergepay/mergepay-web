"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useGroupStore } from "@/lib/group-store";
import {
  ChevronDown,
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
import { ExportHistoryButton } from "@/components/expenses/ExportHistoryButton";
import { ExpenseExportModal } from "@/components/ExpenseExportModal";
import { RecurringExpenseScheduler } from "@/components/RecurringExpenseScheduler";
import { GroupAnalytics } from "@/components/expenses/GroupAnalytics";
import { SettleDialog, type BulkSettleTarget } from "@/components/settle/settle-dialog";
import { BulkSettleBar } from "@/components/settle/bulk-settle-bar";
import { buildBulkTarget, type UnsettledShare } from "@/lib/bulkSettle";
import { BalancesPanel } from "@/components/balances/balances-panel";
import { LedgerPanel } from "@/components/ledger/ledger-panel";
import { TreasuryPanel } from "@/components/treasury/treasury-panel";
import { MembersPanel } from "@/components/groups/members-panel";
import {
  SectionBoundary,
  SectionError,
  SectionLoading,
} from "@/components/ui/section";
import { useGroup, useInfiniteExpenses, useMe } from "@/lib/queries";
import type { GroupMember } from "@/lib/types";
import { mergeExpensePages, sortExpensesByDateDesc } from "@/lib/expenses";
import { apiErrorMessage } from "@/lib/errorHandler";
import { resolveSectionStatus } from "@/lib/sectionState";
import { useWalletDisconnected } from "@/lib/wallet-store";

type Tab = "expenses" | "recurring" | "balances" | "ledger" | "treasury" | "members";


/**
 * Records per request. Large enough that most groups never need a second
 * page, small enough that a group with hundreds of expenses does not pay
 * first-paint cost for the whole history. The API clamps `limit` at 100.
 */
const EXPENSES_PAGE_SIZE = 20;

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  // The profile request only supplies "(you)" markers; a failure must not
  // take the whole group page down with it.
  const { data: me } = useMe();
  const { data: detail, isLoading, isError, error, refetch } = useGroup(id);
  const [tab, setTab] = useState<Tab>("expenses");
  const [addOpen, setAddOpen] = useState(false);
  // Keep the active group id in a tiny client store so sibling routes
  // (e.g. balances, treasury) can reuse it without re-fetching.
  const setSelectedGroup = useGroupStore((s) => s.setSelectedGroup);
  // Expense creation feeds on-chain settlement — lock it while the
  // wallet is disconnected.
  const walletDisconnected = useWalletDisconnected();

  useEffect(() => {
    setSelectedGroup(id);
  }, [id, setSelectedGroup]);

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

  if (isLoading || !detail) {
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
            <Button
              onClick={() => setAddOpen(true)}
              disabled={walletDisconnected}
              title={
                walletDisconnected
                  ? "Reconnect your wallet to add an expense"
                  : undefined
              }
            >
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
            id: "recurring",
            label: "Recurring",
            icon: <Landmark className="h-4 w-4" />,
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
      {tab === "recurring" && (
        <SectionBoundary subject="the recurring scheduler">
          <RecurringExpenseScheduler
            groupId={id}
            members={detail.members}
            currentUserId={currentUserId}
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
  members: GroupMember[];
  onAdd: () => void;
}) {
  // Bulk-settle selection state. Kept local to this tab so leaving the
  // expenses tab (e.g. to balances) automatically drops the selection.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<BulkSettleTarget | null>(null);
  const walletDisconnected = useWalletDisconnected();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteExpenses(groupId, { limit: EXPENSES_PAGE_SIZE });

  // Merged across every loaded page and deduped on the expense id, so a
  // refetch that re-issues page 1 (or a page boundary that shifts when a
  // new expense lands) cannot render the same record twice.
  const expenses = useMemo(() => mergeExpensePages(data?.pages), [data]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }
  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds([]);
  }
  function openBulkDialog(shares: UnsettledShare[]) {
    // Mirror the bar's own validation, but build the dialog-bound target
    // so the receipt can list per-expense rows by their on-page title.
    const { target, error: bulkError } = buildBulkTarget(shares);
    if (bulkError || !target) return;
    const titleById = new Map(expenses.map((e) => [e.id, e.title]));
    setBulkTarget({
      ...target,
      rows: target.expenseIds.map((id) => ({
        expenseId: id,
        title: titleById.get(id) ?? id,
        amount:
          shares.find((s) => s.expenseId === id)?.amount ?? "0.0000000",
      })),
    });
    setBulkOpen(true);
  }

  const status = resolveSectionStatus({
    isLoading,
    isError: isError && expenses.length === 0,
    hasData: data !== undefined,
    isEmpty: expenses.length === 0,
  });

  // Only the very first page gets the skeleton. Later pages keep the
  // records already on screen and put the spinner on the load-more
  // control instead.
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

  if (expenses.length === 0) {
    return (
      <EmptyState
        icon={<Receipt className="h-7 w-7" />}
        title="No expenses yet"
        description="Log your first shared bill and let Mergepay split it."
        action={
          <Button
            onClick={onAdd}
            disabled={walletDisconnected}
            title={
              walletDisconnected
                ? "Reconnect your wallet to add an expense"
                : undefined
            }
          >
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
    <div className="flex items-center justify-end gap-2">
      <ExportHistoryButton groupId={groupId} currentUserId={currentUserId} />
      <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
        <ListChecks className="h-4 w-4" /> Settle in bulk
      </Button>
    </div>
  );

  return (
    <>
      <GroupAnalytics expenses={expenses} />
      <div className="mb-4 flex items-center justify-between">{actionArea}</div>
      <div className="space-y-3">
        <ul className="space-y-3" aria-label="Group expenses">
          {expenses.map((e) => (
            <li key={e.id}>
              <ExpenseCard
                expense={e}
                groupId={groupId}
                currentUserId={currentUserId}
                members={members}
                selectable={selectMode}
                selected={selectedIds.includes(e.id)}
                onToggleSelect={() => toggleSelect(e.id)}
              />
            </li>
          ))}
        </ul>

        <p className="sr-only" role="status" aria-live="polite">
          {isFetchingNextPage
            ? "Loading more expenses"
            : `Showing ${expenses.length} expense${
                expenses.length === 1 ? "" : "s"
              }${hasNextPage ? ", more available" : ", end of history"}`}
        </p>

        {isError && (
          <div
            className="rounded-xl border-2 border-ink bg-flamingo-pale px-4 py-3 text-sm"
            role="alert"
          >
            {apiErrorMessage(error, "We couldn't load more expenses.")}
          </div>
        )}

        <div className="flex flex-col items-center gap-2 pt-1">
          {hasNextPage ? (
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => fetchNextPage()}
              loading={isFetchingNextPage}
              aria-busy={isFetchingNextPage}
              aria-label={
                isError ? "Try loading more expenses again" : "Load older expenses"
              }
            >
              {!isFetchingNextPage && <ChevronDown className="h-4 w-4" />}
              {isFetchingNextPage
                ? "Loading…"
                : isError
                  ? "Try again"
                  : "Load older expenses"}
            </Button>
          ) : (
            <p className="text-xs text-ink/50">
              That&apos;s every expense in this group.
            </p>
          )}
        </div>
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
