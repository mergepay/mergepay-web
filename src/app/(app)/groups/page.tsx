"use client";

import { useState } from "react";
import { useDashboardPreferences } from "@/lib/use-dashboard-preferences";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { Plus, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { GroupErrorBoundary } from "@/components/groups/GroupErrorBoundary";
import { useGroups } from "@/lib/queries";
import { orderGroupsByActive, useGroupStore } from "@/lib/group-store";
import { CreateGroupDialog } from "@/components/groups/create-group-dialog";
import { JoinGroupDialog } from "@/components/groups/join-group-dialog";
import { ListSkeleton, GroupCardSkeleton, DashboardCardSkeleton } from "@/components/ui/skeleton";
import { GroupListSkeleton } from "@/components/groups/GroupListSkeleton";
import { motion } from "framer-motion";

export default function GroupsPage() {
  const { data, isLoading, refetch } = useGroups();
  // The group the user was last in is persisted, so a reload puts it back at
  // the top of the list instead of making them hunt for it (#494).
  const activeGroupId = useGroupStore((s) => s.selectedGroupId);
  const { user } = useAuth();
  const { preferences, updatePreferences } = useDashboardPreferences(user?.id);
  const groups = orderGroupsByActive(data?.groups ?? [], activeGroupId)
    .filter((group) => preferences.activeGroupTab === "all" ||
      (preferences.activeGroupTab === "archived" ? group.archived : !group.archived))
    .sort((a, b) => {
      switch (preferences.groupSortOrder) {
        case "name-asc": return a.name.localeCompare(b.name);
        case "name-desc": return b.name.localeCompare(a.name);
        case "oldest": return a.createdAt.localeCompare(b.createdAt);
        default: return b.createdAt.localeCompare(a.createdAt);
      }
    });

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <GroupErrorBoundary onReset={() => refetch()}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl uppercase tracking-wider">
              Your Groups
            </h1>
            <p className="text-sm text-ink/70">
              Shared spending circles on Stellar
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setJoinOpen(true)}>
              <Users className="h-4 w-4" /> Join group
            </Button>
            <Button
              onClick={() => setCreateOpen(true)}
              data-testid="groups-create"
            >
              <Plus className="h-4 w-4" /> New group
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3" aria-label="Group display preferences">
          <label className="text-sm font-bold" htmlFor="group-tab">Show</label>
          <select id="group-tab" value={preferences.activeGroupTab}
            onChange={(event) => updatePreferences({ activeGroupTab: event.target.value as typeof preferences.activeGroupTab })}
            className="rounded-lg border-2 border-ink bg-paper px-3 py-2 text-sm">
            <option value="all">All groups</option>
            <option value="active">Active groups</option>
            <option value="archived">Archived groups</option>
          </select>
          <label className="text-sm font-bold" htmlFor="group-sort">Sort</label>
          <select id="group-sort" value={preferences.groupSortOrder}
            onChange={(event) => updatePreferences({ groupSortOrder: event.target.value as typeof preferences.groupSortOrder })}
            className="rounded-lg border-2 border-ink bg-paper px-3 py-2 text-sm">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
          </select>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-cream border-3 border-ink rounded-2xl shadow-brutal p-5 space-y-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-10 w-10 rounded-xl border-3 border-ink bg-ink/15 animate-pulse" />
                  <div className="h-4 w-16 bg-ink/15 rounded animate-pulse" />
                </div>
                <div className="h-6 w-3/4 bg-ink/15 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-ink/15 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : (data?.groups?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8 text-ink" />}
            title="No groups yet"
            description="You haven't joined any groups yet. Create a new group to get started!"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> Create group
                </Button>
                <Button variant="outline" onClick={() => setJoinOpen(true)}>
                  <Users className="h-4 w-4" /> Join with code
                </Button>
              </div>
            }
          />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {groups.map((group) => (
              <Link
                key={group.id}
                href={`/groups/${group.id}`}
                data-testid="group-card"
                data-group-id={group.id}
              >
                <Card className="h-full transition-all hover:-translate-y-1 hover:shadow-brutal-lg">
                  <CardContent className="p-5 flex flex-col justify-between h-full">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl border-3 border-ink bg-aqua shadow-brutal-sm">
                          <Users className="h-5 w-5" />
                        </span>
                        <span className="font-mono text-xs text-ink/50">
                          {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <h2 className="min-w-0 flex-1 font-display text-lg uppercase tracking-tight truncate">
                          {group.name}
                        </h2>
                        {group.id === activeGroupId && (
                          <span className="shrink-0 rounded-full border-2 border-ink bg-lime px-2 py-0.5 font-mono text-[10px] font-bold uppercase shadow-brutal-sm">
                            Active
                          </span>
                        )}
                      </div>
                      {group.description && (
                        <p className="mt-1 text-sm text-ink/70 line-clamp-2">
                          {group.description}
                        </p>
                      )}
                    </div>
                    <div className="mt-4 pt-3 border-t-2 border-ink/10 flex items-center justify-between text-xs font-bold uppercase">
                      <span>Open group</span>
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </motion.div>
        )}

        <CreateGroupDialog open={createOpen} onClose={() => setCreateOpen(false)} />
        <JoinGroupDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
      </div>
    </GroupErrorBoundary>
  );
}
