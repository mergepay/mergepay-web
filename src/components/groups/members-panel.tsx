"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, LogOut, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PubkeyChip } from "@/components/tx-link";
import { InviteDialog } from "./invite-dialog";
import { useArchiveGroup, useLeaveGroup } from "@/lib/queries";
import { ApiRequestError } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { GroupDetail } from "@/lib/types";

export function MembersPanel({
  detail,
  currentUserId,
}: {
  detail: GroupDetail;
  currentUserId: string;
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const archive = useArchiveGroup(detail.group.id);
  const leave = useLeaveGroup(detail.group.id);
  const isAdmin = detail.yourRole === "admin";

  async function handleArchive() {
    if (!confirm("Archive this group? Members keep read access to the ledger.")) return;
    try {
      await archive.mutateAsync();
      toast.success("Group archived");
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.message : "Could not archive");
    }
  }

  async function handleLeave() {
    if (!confirm("Leave this group?")) return;
    try {
      await leave.mutateAsync();
      toast.success("You left the group");
      router.push("/groups");
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.message : "Could not leave");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm uppercase tracking-widest text-ink/60">
          {detail.members.length} member{detail.members.length === 1 ? "" : "s"}
        </h3>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4" /> Invite
        </Button>
      </div>

      <div className="space-y-2">
        {detail.members.map((m) => (
          <Card key={m.id} className="flex items-center justify-between gap-3 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar user={m.user} />
              <div className="min-w-0">
                <p className="truncate font-bold">
                  {m.user.displayName}
                  {m.userId === currentUserId && (
                    <span className="ml-1 text-ink/40">(you)</span>
                  )}
                </p>
                <p className="text-xs text-ink/50">joined {timeAgo(m.joinedAt)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PubkeyChip publicKey={m.user.stellarPublicKey} />
              {m.role === "admin" && <Badge tone="grape">Admin</Badge>}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-t-3 border-ink pt-5">
        {isAdmin && !detail.group.archived && (
          <Button variant="outline" onClick={handleArchive} loading={archive.isPending}>
            <Archive className="h-4 w-4" /> Archive group
          </Button>
        )}
        <Button variant="danger" onClick={handleLeave} loading={leave.isPending}>
          <LogOut className="h-4 w-4" /> Leave group
        </Button>
      </div>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        groupId={detail.group.id}
      />
    </div>
  );
}
