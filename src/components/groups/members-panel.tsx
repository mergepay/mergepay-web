"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Check,
  ChevronDown,
  Eye,
  LogOut,
  QrCode,
  Shield,
  ShieldCheck,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PubkeyChip } from "@/components/tx-link";
import { AccessibleDialog as Dialog } from "@/components/ui/AccessibleDialog";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
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

const ROLE_OPTIONS: {
  value: Role;
  label: string;
  hint: string;
  icon: typeof Shield;
}[] = [
  { value: "admin", label: "Admin", hint: "Manage members and settings", icon: ShieldCheck },
  { value: "member", label: "Member", hint: "Add and settle expenses", icon: Shield },
  { value: "viewer", label: "Viewer", hint: "Read-only access", icon: Eye },
];

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
                  <DropdownMenu
                    label={`Manage ${m.user.displayName}`}
                    disabled={updateRole.isPending || removeMember.isPending}
                    trigger={(props) => (
                      <Button
                        {...props}
                        size="sm"
                        variant="outline"
                        aria-label={`Manage ${m.user.displayName}`}
                      >
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        {ROLE_OPTIONS.find((role) => role.value === m.role)?.label ??
                          m.role}
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  >
                    {ROLE_OPTIONS.map(({ value, label, hint, icon: Icon }) => {
                      const current = m.role === value;
                      return (
                        <DropdownMenuItem
                          key={value}
                          textValue={label}
                          disabled={current}
                          onSelect={() => void handleRoleChange(m.id, value)}
                        >
                          <Icon
                            className="mt-0.5 h-4 w-4 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="flex-1">
                            <span className="block font-display text-xs uppercase tracking-wide">
                              {label}
                              {current && (
                                <span className="sr-only"> (current role)</span>
                              )}
                            </span>
                            <span className="block text-[11px] font-normal normal-case text-ink/60">
                              {hint}
                            </span>
                          </span>
                          {current && (
                            <Check
                              className="mt-0.5 h-4 w-4 shrink-0"
                              aria-hidden="true"
                            />
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                    <div
                      role="separator"
                      className="my-1 border-t-2 border-ink/10"
                    />
                    <DropdownMenuItem
                      textValue={`Remove ${m.user.displayName}`}
                      onSelect={() =>
                        void handleRemoveMember(m.id, m.user.displayName)
                      }
                      className="text-cherry"
                    >
                      <UserMinus
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="flex-1">
                        <span className="block font-display text-xs uppercase tracking-wide">
                          Remove from group
                        </span>
                        <span className="block text-[11px] font-normal normal-case text-ink/60">
                          Revoke this member&apos;s access
                        </span>
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenu>
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
