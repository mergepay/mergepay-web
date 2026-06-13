"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import { ListSkeleton } from "@/components/ui/skeleton";
import { CreateGroupDialog } from "@/components/groups/create-group-dialog";
import { JoinGroupDialog } from "@/components/groups/join-group-dialog";
import { useGroups, useMe } from "@/lib/queries";
import { formatAmount } from "@/lib/format";
import type { GroupSummary } from "@/lib/types";

export default function DashboardPage() {
  const { data: me } = useMe();
  const { data, isLoading } = useGroups();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const groups = useMemo(
    () => (data?.groups ?? []).filter((g) => !g.archived),
    [data]
  );

  const totals = useMemo(() => {
    let owed = 0;
    let owe = 0;
    for (const g of groups) {
      const n = parseFloat(g.yourNet);
      if (n > 0) owed += n;
      else owe += -n;
    }
    return { owed, owe, net: owed - owe };
  }, [groups]);

  const firstName = me?.user.displayName.split(/\s+/)[0] ?? "there";

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

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="You are owed"
          value={formatAmount(totals.owed)}
          tone="bg-lime"
          icon={<ArrowDownRight className="h-5 w-5" />}
        />
        <StatCard
          label="You owe"
          value={formatAmount(totals.owe)}
          tone="bg-flamingo"
          icon={<ArrowUpRight className="h-5 w-5" />}
        />
        <StatCard
          label="Net position"
          value={`${totals.net >= 0 ? "+" : ""}${formatAmount(totals.net)}`}
          tone="bg-grape text-white"
          icon={<Scale className="h-5 w-5" />}
        />
      </div>

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

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : groups.length === 0 ? (
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

      <CreateGroupDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinGroupDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: string;
  icon: React.ReactNode;
}) {
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
      <div className="px-4 py-4">
        <span className="font-mono text-3xl font-bold tabular-nums">{value}</span>
      </div>
    </Card>
  );
}

function GroupCard({ group }: { group: GroupSummary }) {
  const net = parseFloat(group.yourNet);
  const settled = Math.abs(net) < 0.0000001;
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
            {settled ? "All settled" : net > 0 ? "You are owed" : "You owe"}
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
