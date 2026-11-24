"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Users, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { CreateGroupDialog } from "@/components/groups/create-group-dialog";
import { JoinGroupDialog } from "@/components/groups/join-group-dialog";
import type { Group, GroupSummary } from "@/lib/types";

export interface GroupListProps {
  /** Array of groups to render */
  groups?: (Group | GroupSummary)[];
  /** Whether groups are currently loading */
  isLoading?: boolean;
  /** Optional callback when create group button is clicked */
  onCreateGroup?: () => void;
  /** Optional callback when join group button is clicked */
  onJoinGroup?: () => void;
  /** Custom empty state message override */
  emptyMessage?: string;
  /** Custom empty state description override */
  emptyDescription?: string;
}

/**
 * Neobrutalist GroupList component.
 * Displays a grid of user groups or a helpful placeholder empty state when no groups exist.
 */
import { getStoredGroupPreferences, setStoredGroupPreferences } from "@/lib/storage";

export function GroupList({
  groups = [],
  isLoading = false,
  onCreateGroup,
  onJoinGroup,
  emptyMessage = "No groups yet",
  emptyDescription = "You haven't joined any groups yet. Create a new group to get started!",
}: GroupListProps) {
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = React.useState<string>(() => getStoredGroupPreferences().activeTab ?? "all");
  const [sortOrder, setSortOrder] = React.useState<string>(() => getStoredGroupPreferences().sortOrder ?? "recent");

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setStoredGroupPreferences({ activeTab: tab });
  };

  const handleSortChange = (sort: string) => {
    setSortOrder(sort);
    setStoredGroupPreferences({ sortOrder: sort });
  };
  const [internalJoinOpen, setInternalJoinOpen] = useState(false);

  const handleCreate = () => {
    if (onCreateGroup) {
      onCreateGroup();
    } else {
      setInternalCreateOpen(true);
    }
  };

  const handleJoin = () => {
    if (onJoinGroup) {
      onJoinGroup();
    } else {
      setInternalJoinOpen(true);
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="group-list-loading">
        <ListSkeleton rows={6} variant="card" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <>
        <div data-testid="group-list-empty">
          <EmptyState
            icon={<Users className="h-8 w-8 text-ink" />}
            title={emptyMessage}
            description={emptyDescription}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={handleCreate} data-testid="empty-create-group-btn">
                  <Plus className="h-4 w-4 mr-1" /> Create group
                </Button>
                <Button variant="outline" onClick={handleJoin} data-testid="empty-join-group-btn">
                  <Users className="h-4 w-4 mr-1" /> Join group
                </Button>
              </div>
            }
          />
        </div>
        {!onCreateGroup && internalCreateOpen && (
          <CreateGroupDialog
            open={internalCreateOpen}
            onClose={() => setInternalCreateOpen(false)}
          />
        )}
        {!onJoinGroup && internalJoinOpen && (
          <JoinGroupDialog
            open={internalJoinOpen}
            onClose={() => setInternalJoinOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="group-list-grid">
      {groups.map((group) => (
        <Link key={group.id} href={`/groups/${group.id}`} className="block h-full">
          <Card className="h-full border-3 border-ink bg-paper transition-all hover:-translate-y-1 hover:shadow-brutal-lg">
            <CardContent className="flex flex-col justify-between h-full p-5">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border-3 border-ink bg-aqua shadow-brutal-sm">
                    <Users className="h-5 w-5 text-ink" />
                  </span>
                  <span className="font-mono text-xs text-ink/50">
                    {"memberCount" in group && typeof group.memberCount === "number"
                      ? `${group.memberCount} member${group.memberCount === 1 ? "" : "s"}`
                      : "1 member"}
                  </span>
                </div>
                <h3 className="font-display text-lg uppercase tracking-tight truncate text-ink">
                  {group.name}
                </h3>
                {group.description && (
                  <p className="mt-1 text-sm text-ink/70 line-clamp-2">
                    {group.description}
                  </p>
                )}
              </div>
              <div className="mt-4 pt-3 border-t-2 border-ink/10 flex items-center justify-between text-xs font-bold uppercase text-ink">
                <span>Open circle</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
