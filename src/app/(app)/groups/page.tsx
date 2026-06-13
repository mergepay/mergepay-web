"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NetAmount } from "@/components/amount";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { CreateGroupDialog } from "@/components/groups/create-group-dialog";
import { JoinGroupDialog } from "@/components/groups/join-group-dialog";
import { useGroups } from "@/lib/queries";

export default function GroupsPage() {
  const { data, isLoading } = useGroups();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [filter, setFilter] = useState<"active" | "archived">("active");

  const groups = useMemo(() => {
    const all = data?.groups ?? [];
    return all.filter((g) => (filter === "archived" ? g.archived : !g.archived));
  }, [data, filter]);

  return (
    <>
      <PageHeader
        title="Groups"
        description="Every circle is a Stellar-backed settlement space with its own ledger."
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

      <Tabs
        className="mb-6"
        active={filter}
        onChange={(id) => setFilter(id as "active" | "archived")}
        tabs={[
          { id: "active", label: "Active" },
          { id: "archived", label: "Archived" },
        ]}
      />

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title={filter === "archived" ? "No archived groups" : "No groups yet"}
          description={
            filter === "archived"
              ? "Groups you archive will show up here."
              : "Create a circle or join one with an invite code."
          }
          action={
            filter === "active" && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create a group
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => {
            const net = parseFloat(g.yourNet);
            const settled = Math.abs(net) < 0.0000001;
            return (
              <Link key={g.id} href={`/groups/${g.id}`}>
                <Card hover className="h-full p-5">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-lg uppercase tracking-tight">
                      {g.name}
                    </h3>
                    {g.treasuryEnabled && <Badge tone="aqua">Treasury</Badge>}
                    {g.archived && <Badge tone="paper">Archived</Badge>}
                  </div>
                  {g.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-ink/60">
                      {g.description}
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-ink/50">
                      <Users className="h-3.5 w-3.5" /> {g.memberCount}
                    </span>
                    {settled ? (
                      <Badge tone="lime">Settled</Badge>
                    ) : (
                      <NetAmount value={net} assetCode={g.netAssetCode} />
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <CreateGroupDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinGroupDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </>
  );
}
