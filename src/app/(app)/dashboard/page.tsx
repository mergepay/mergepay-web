"use client";

import { useAuth } from "@/hooks/useAuth";
import { useGroups } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Users, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CreateGroupDialog } from "@/components/groups/create-group-dialog";
import { JoinGroupDialog } from "@/components/groups/join-group-dialog";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { GroupBudgetTracker } from "@/components/GroupBudgetTracker";
import type { Group } from "@/lib/types";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useGroups();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const groups = data?.groups ?? [];

  return (
    <ErrorBoundary onReset={() => refetch()}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl uppercase tracking-tight">
              Dashboard
            </h1>
            <p className="text-sm text-ink/70">
              Welcome back, {user?.displayName ?? "Stellar User"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setJoinOpen(true)}>
              Join group
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New group
            </Button>
          </div>
        </div>

        <ErrorBoundary>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {isLoading && (
              <div className="col-span-full py-12 text-center text-sm text-ink/60">
                Loading your groups...
              </div>
            )}
            {error && (
              <div className="col-span-full rounded-2xl border-3 border-ink bg-flamingo-pale p-6">
                <p className="font-bold">Could not load groups</p>
                <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
                  Retry
                </Button>
              </div>
            )}
            {!isLoading && !error && groups.length === 0 && (
              <Card className="col-span-full border-3 border-ink bg-cream p-8 text-center">
                <CardContent className="space-y-4">
                  <Users className="mx-auto h-12 w-12 text-ink/40" />
                  <h2 className="font-display text-lg uppercase">No groups yet</h2>
                  <p className="text-sm text-ink/60 max-w-sm mx-auto">
                    Create a circle to start splitting expenses or join an existing group with an invite code.
                  </p>
                  <div className="flex justify-center gap-2">
                    <Button onClick={() => setCreateOpen(true)}>Create group</Button>
                    <Button variant="outline" onClick={() => setJoinOpen(true)}>Join group</Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {groups.map((group: Group) => (
              <Card key={group.id} className="border-3 border-ink bg-paper transition-all hover:-translate-y-1">
                <CardContent className="flex flex-col justify-between h-full p-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-display text-lg uppercase tracking-tight truncate">
                        {group.name}
                      </span>
                    </div>
                    {group.description && (
                      <p className="mt-1 text-xs text-ink/70 line-clamp-2">
                        {group.description}
                      </p>
                    )}
                  </div>
                  <div className="mt-6 flex items-center justify-between pt-4 border-t-2 border-ink/10">
                    <span className="text-xs font-mono text-ink/50">
                      {group.members?.length ?? 1} member{(group.members?.length ?? 1) === 1 ? "" : "s"}
                    ંચ</span>
                    <Link href={`/groups/${group.id}`}>
                      <Button size="sm" variant="outline">
                        Open <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ErrorBoundary>

        <CreateGroupDialog open={createOpen} onClose={() => setCreateOpen(false)} />
        <JoinGroupDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
      </div>
    </ErrorBoundary>
  );
}
