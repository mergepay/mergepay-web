"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, LogOut, UserPlus, UserMinus, Shield, ShieldCheck, Eye, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PubkeyChip } from "@/components/tx-link";
import { AccessibleDialog as Dialog } from "@/components/ui/AccessibleDialog";
import { InviteMemberModal } from "./InviteMemberModal";
import { useCreateInvite } from "@/lib/queries";
import { describeInviteFailure, isSafeInviteUrl } from "@/lib/inviteLink";
import { QRCodeSVG } from "@/components/ui/lazy-qr-code";
import {
  useArchiveGroup,
  useLeaveGroup,
  useUpdateMemberRole,
  useRemoveMember,
} from "@/lib/queries";
import { handleApiError } from "@/lib/errorHandler";
import { Timestamp } from "@/components/timestamp";
import type { GroupDetail, Role } from "@/lib/types";

export function MembersPanel({
  detail,
  currentUserId,
}: {
  detail: GroupDetail;
  currentUserId: string;
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [invite, setInvite] = useState<{ code: string; url: string } | null>(null);
  const archive = useArchiveGroup(detail.group.id);
  const leave = useLeaveGroup(detail.group.id);
  const updateRole = useUpdateMemberRole(detail.group.id);
  const removeMember = useRemoveMember(detail.group.id);
  const createInvite = useCreateInvite(detail.group.id);
  const isAdmin = detail.yourRole === "admin";

  async function generateInvite() {
    try {
      const { invite: created } = await createInvite.mutateAsync({});
      const shareUrl = isSafeInviteUrl(created.url) ? created.url : null;
      if (shareUrl) {
        setInvite({ code: created.code, url: shareUrl });
        setQrOpen(true);
      }
    } catch (e) {
      toast.error(describeInviteFailure(e).description);
    }
  }

  async function handleArchive() {
    if (!confirm("Archive this group? Members keep read access to the ledger.")) return;
    try {
      await archive.mutateAsync();
      toast.success("Group archived");
    } catch (e) {
      handleApiError(e, "Could not archive");
    }
  }

  async function handleLeave() {
    if (!confirm("Leave this group?")) return;
    try {
      await leave.mutateAsync();
      toast.success("You left the group");
      router.push("/groups");
    } catch (e) {
      handleApiError(e, "Could not leave");
    }
  }

  async function handleRoleChange(memberId: string, newRole: Role) {
    try {
      await updateRole.mutateAsync({ memberId, role: newRole });
      toast.success(`Role updated to ${newRole}`);
    } catch (e) {
      handleApiError(e, "Could not update member role");
    }
  }

  async function handleRemoveMember(memberId: string, memberName: string) {
    if (!confirm(`Remove ${memberName} from this group?`)) return;
    try {
      await removeMember.mutateAsync(memberId);
      toast.success(`${memberName} removed from group`);
    } catch (e) {
      handleApiError(e, "Could not remove member");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm uppercase tracking-widest text-ink/60">
          {detail.members.length} member{detail.members.length === 1 ? "" : "s"}
        </h3>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void generateInvite()} loading={createInvite.isPending}>
            <QrCode className="h-4 w-4" /> QR Code
          </Button>
          {isAdmin ? (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" /> Invite
            </Button>
          ) : (
            <Badge tone="paper">Members</Badge>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {detail.members.map((m) => {
          const isSelf = m.userId === currentUserId;
          return (
            <Card key={m.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar user={m.user} />
                <div className="min-w-0">
                  <p className="truncate font-bold">
                    {m.user.displayName}
                    {isSelf && (
                      <span className="ml-1 text-ink/40">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-ink/50">
                    joined{" "}
                    <Timestamp value={m.joinedAt} mode="relative" prefix="Joined" />
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                <PubkeyChip publicKey={m.user.stellarPublicKey} />
                {isAdmin && !isSelf ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.id, e.target.value as Role)}
                      disabled={updateRole.isPending}
                      aria-label={`Change role for ${m.user.displayName}`}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.currentTarget.blur();
                        }
                      }}
                      className="rounded-lg border-2 border-ink bg-paper px-2 py-1 text-xs font-bold shadow-brutal-sm focus:outline-none focus:ring-2 focus:ring-grape"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      onClick={() => handleRemoveMember(m.id, m.user.displayName)}
                      disabled={removeMember.isPending}
                      aria-label={`Remove ${m.user.displayName}`}
                      className="rounded-lg border-2 border-ink bg-flamingo p-1.5 shadow-brutal-sm hover:bg-cherry hover:text-paper transition-colors focus:outline-none focus:ring-2 focus:ring-cherry"
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    {m.role === "admin" && <Badge tone="grape">Admin</Badge>}
                    {m.role === "member" && <Badge tone="paper">Member</Badge>}
                    {m.role === "viewer" && <Badge tone="butter">Viewer</Badge>}
                  </>
                )}
              </div>
            </Card>
          );
        })}
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


      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        groupId={detail.group.id}
        groupName={detail.group.name}
      />

      {qrOpen && (
        <Dialog
          isOpen={qrOpen}
          onClose={() => setQrOpen(false)}
          title="Group QR Code"
        >
          {invite && (
            <div className="flex flex-col items-center space-y-4">
              <div className="rounded-2xl border-3 border-ink bg-white p-4 shadow-brutal">
                <QRCodeSVG value={invite.url} size={200} fgColor="#18130E" bgColor="#FFFFFF" level="M" />
              </div>
              <div className="w-full space-y-1.5">
                <label className="font-display text-xs uppercase tracking-widest text-ink/70">
                  Invite code
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-xl border-2 border-ink bg-paper px-3 py-2 font-mono text-xs select-all">
                    {invite.code}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(invite.code);
                      toast.success("Invite code copied");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
