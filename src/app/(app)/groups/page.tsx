"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useGroups } from "@/lib/queries";
import { CreateGroupDialog } from "@/components/groups/create-group-dialog";
import { JoinGroupDialog } from "@/components/groups/join-group-dialog";

export default function GroupsPage() {
  const { data, isLoading } = useGroups();
  const groups = data?.groups ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  return (
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
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New group
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-ink/60 font-mono text-sm">
          Loading groups...
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8 text-ink" />}
          title="No groups yet"
          description="Create a new circle or join an existing group with an invite code to start splitting expenses transparently on Stellar."
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Link key={group.id} href={`/groups/${group.id}`}>
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
                    <h2 className="font-display text-lg uppercase tracking-tight truncate">
                      {group.name}
                    </h2>
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
        </div>
      )}

      <CreateGroupDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinGroupDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}
