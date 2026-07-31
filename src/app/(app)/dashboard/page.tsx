"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Plus,
  Scale,
  Users,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { NetAmount } from "@/components/amount";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton, Skeleton } from "@/components/ui/skeleton";
import {
  SectionBoundary,
  SectionError,
  SectionLoading,
} from "@/components/ui/section";
import { CreateGroupDialog } from "@/components/groups/create-group-dialog";
import { JoinGroupDialog } from "@/components/groups/join-group-dialog";
import { useGroups, useMe } from "@/lib/queries";
import { useGroupStore } from "@/lib/group-store";
import {
  amountToStroops,
  formatAssetAmount,
  type FormattedAmount,
} from "@/lib/currency";
import { summarizeNetsByAsset } from "@/lib/totals";
import {
  UNAVAILABLE_VALUE_LABEL,
  financialValue,
  resolveSectionStatus,
} from "@/lib/sectionState";
import type { GroupSummary } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  // A failed profile request must not blank the dashboard: the greeting
  // degrades to a generic one while every data section keeps working.
  const { data: me } = useMe();
  const { data, isLoading, isError, error, refetch } = useGroups();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const selectedGroupId = useGroupStore((s) => s.selectedGroupId);
  const restored = useGroupStore((s) => s.restored);

  useEffect(() => {
    if (!restored || isLoading || !data) return;
    if (!selectedGroupId) return;
    const groups = data?.groups ?? [];
    const exists = groups.some((g: { id: string }) => g.id === selectedGroupId);
    if (exists) {
      router.replace(`/groups/${selectedGroupId}`);
    } else {
      useGroupStore.getState().clear();
    }
  }, [restored, selectedGroupId, isLoading, data, router]);

  const groups = useMemo(
    () => (data?.groups ?? []).filter((g) => !g.archived),
    [data]
  );

  // Balances are totalled per asset: being owed USDC in one circle and
  // owing XLM in another are not addable, and a single combined figure
  // rendered next to one asset code would misstate both.
  const assetTotals = useMemo(() => summarizeNetsByAsset(groups), [groups]);
  // Lead with the asset the user has the most at stake in; the rest are
  // summarised as badges underneath.
  const primaryTotals = assetTotals[0] ?? null;
  const primaryAsset = primaryTotals?.assetCode ?? null;
  const otherTotals = assetTotals.slice(1);

  const firstName = me?.user.displayName.split(/\s+/)[0] ?? "there";

  // Totals are derived from the group list, so they are only meaningful
  // once that request has succeeded. While it is loading or failed they
  // must not render as zero — that reads as "you are square".
  const totalsAvailable = !isLoading && !isError && data !== undefined;
  const groupsStatus = resolveSectionStatus({
    isLoading,
    isError,
    hasData: data !== undefined,
    isEmpty: groups.length === 0,
  });

  return (
    <>
      <PageHeader
        title={`Hi, ${firstName}`}
        description="Your circles, balances, and on-chain settlements at a glance."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setJoinOpen(true)}>
              Join
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New group
            </Button>
          </div>
        }
      />

      <SectionBoundary subject="your balance totals">
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="You are owed"
            amount={formatAssetAmount(primaryTotals?.owed ?? "0", primaryAsset)}
            available={totalsAvailable}
            loading={isLoading}
            tone="bg-lime"
            icon={<ArrowDownRight className="h-5 w-5" />}
          />
          <StatCard
            label="You owe"
            amount={formatAssetAmount(primaryTotals?.owe ?? "0", primaryAsset)}
            available={totalsAvailable}
            loading={isLoading}
            tone="bg-flamingo"
            icon={<ArrowUpRight className="h-5 w-5" />}
          />
          <StatCard
            label="Net position"
            amount={formatAssetAmount(primaryTotals?.net ?? "0", primaryAsset, {
              signDisplay: "always",
            })}
            available={totalsAvailable}
            loading={isLoading}
            tone="bg-grape text-white"
            icon={<Scale className="h-5 w-5" />}
          />
        </div>
        {totalsAvailable && otherTotals.length > 0 && (
          <div className="-mt-4 mb-8 flex flex-wrap items-center gap-2">
            <span className="font-display text-[10px] uppercase tracking-widest text-ink/50">
              Also holding
            </span>
            {otherTotals.map((totals) => (
              <Badge key={totals.assetCode} tone="aqua">
                <NetAmount
                  value={totals.net}
                  assetCode={totals.assetCode}
                  className="text-xs"
                />
              </Badge>
            ))}
          </div>
        )}
      </SectionBoundary>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl uppercase tracking-tight">
          Your groups
        </h2>
        {groups.length > 0 && (
          <Link
            href="/groups"
            className="font-display text-xs uppercase tracking-widest text-grape hover:underline"
          >
            View all →
          </Link>
        )}
      </div>

      <SectionBoundary subject="your groups">
        {groupsStatus === "loading" ? (
          <SectionLoading label="Loading your groups">
            <ListSkeleton rows={3} />
          </SectionLoading>
        ) : groupsStatus === "error" ? (
          <SectionError
            subject="your groups"
            error={error}
            onRetry={() => refetch()}
          />
        ) : groupsStatus === "empty" ? (
          <EmptyState
            icon={<Users className="h-7 w-7" />}
            title="No groups yet"
            description="Create your first circle to start splitting expenses and settling on Stellar."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create a group
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        )}
      </SectionBoundary>

      <CreateGroupDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinGroupDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </>
  );
}

/**
 * A single headline figure.
 *
 * The card keeps its full height in every state, so the layout does not
 * jump as the request resolves. When the figure is unavailable it renders
 * a placeholder with an explicit label rather than a fabricated `0`.
 */
function StatCard({
  label,
  amount,
  available,
  loading,
  tone,
  icon,
}: {
  label: string;
  amount: FormattedAmount;
  available: boolean;
  loading: boolean;
  tone: string;
  icon: React.ReactNode;
}) {
  // An amount we could not parse is as unavailable as one we never loaded.
  const figure = financialValue(amount.text, available && amount.valid);
  return (
    <Card className="overflow-hidden">
      <div className={`flex items-center justify-between border-b-3 border-ink px-4 py-2.5 ${tone}`}>
        <span className="font-display text-xs uppercase tracking-widest">
          {label}
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-ink bg-cream/90 text-ink">
          {icon}
        </span>
      </div>
      <div className="flex h-[4.75rem] items-center px-4">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <span
            className={`font-mono text-3xl font-bold tabular-nums${
              figure.available ? "" : " text-ink/40"
            }`}
            title={figure.available ? undefined : UNAVAILABLE_VALUE_LABEL}
          >
            <span aria-hidden="true">{figure.text}</span>
            <span className="sr-only">
              {figure.available ? amount.label : `${label}: ${figure.label}`}
            </span>
          </span>
        )}
      </div>
    </Card>
  );
}

function GroupCard({ group }: { group: GroupSummary }) {
  // Stroop-exact: a balance is only "settled" when it is exactly zero.
  const stroops = amountToStroops(group.yourNet);
  const settled = stroops === 0n;
  const net = group.yourNet;
  return (
    <Link href={`/groups/${group.id}`}>
      <Card hover className="h-full">
        <div className="flex items-start justify-between p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-display text-lg uppercase tracking-tight">
                {group.name}
              </h3>
              {group.treasuryEnabled && <Badge tone="aqua">Treasury</Badge>}
            </div>
            {group.description && (
              <p className="mt-1 line-clamp-1 text-sm text-ink/60">
                {group.description}
              </p>
            )}
            <div className="mt-3 flex items-center gap-1.5 text-xs text-ink/50">
              <Users className="h-3.5 w-3.5" />
              {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
            </div>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-3 border-ink bg-butter shadow-brutal-sm">
            <Wallet className="h-5 w-5" />
          </div>
        </div>
        <div className="flex items-center justify-between border-t-3 border-ink bg-paper px-5 py-2.5">
          <span className="font-display text-[10px] uppercase tracking-widest text-ink/50">
            {settled
              ? "All settled"
              : stroops !== null && stroops > 0n
                ? "You are owed"
                : "You owe"}
          </span>
          {settled ? (
            <Badge tone="lime">Settled up</Badge>
          ) : (
            <NetAmount value={net} assetCode={group.netAssetCode} />
          )}
        </div>
      </Card>
    </Link>
  );
}
