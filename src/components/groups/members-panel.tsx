"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ChevronDown, LogOut, UserPlus, UserMinus, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PubkeyChip } from "@/components/tx-link";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InviteMemberModal } from "./InviteMemberModal";
import { GroupInviteModal } from "./GroupInviteModal";
import {
  useArchiveGroup,
  useLeaveGroup,
  useUpdateMemberRole,
  useRemoveMember,
} from "@/lib/queries";
import { handleApiError } from "@/lib/errorHandler";
import { Timestamp } from "@/components/timestamp";
import type { GroupDetail, Role } from "@/lib/types";

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

const ROLES: Role[] = ["admin", "member", "viewer"];

/** Which confirmation is open. Replaces the old blocking `window.confirm()` calls. */
type PendingConfirm =
  | { kind: "remove"; memberId: string; memberName: string }
  | { kind: "leave" }
  | { kind: "archive" }
  | null;

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
  const archive = useArchiveGroup(detail.group.id);
  const leave = useLeaveGroup(detail.group.id);
  const updateRole = useUpdateMemberRole(detail.group.id);
  const removeMember = useRemoveMember(detail.group.id);
  const isAdmin = detail.yourRole === "admin";
  const [pending, setPending] = useState<PendingConfirm>(null);
  // Polite live region: screen readers hear the outcome of role and removal
  // actions even when the visual toast is missed or focus is elsewhere.
  const [announcement, setAnnouncement] = useState("");
  // Where focus goes after a removal, because the removed member's menu
  // button (the normal focus-return target) no longer exists.
  const headingRef = useRef<HTMLHeadingElement>(null);

  function announce(message: string) {
    // Clear first so repeating the same message is announced again.
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(message));
  }

  async function handleArchive() {
    try {
      await archive.mutateAsync();
      setPending(null);
      toast.success("Group archived");
      announce("Group archived");
    } catch (e) {
      handleApiError(e, "Could not archive");
    }
  }

  async function handleLeave() {
    try {
      await leave.mutateAsync();
      setPending(null);
      toast.success("You left the group");
      router.push("/groups");
    } catch (e) {
      handleApiError(e, "Could not leave");
    }
  }

  async function handleRoleChange(memberId: string, memberName: string, newRole: Role) {
    try {
      await updateRole.mutateAsync({ memberId, role: newRole });
      toast.success(`Role updated to ${newRole}`);
      announce(`${memberName} is now ${ROLE_LABELS[newRole]}`);
    } catch (e) {
      handleApiError(e, "Could not update member role");
      announce(`Could not change the role for ${memberName}`);
    }
  }

  async function handleRemoveMember(memberId: string, memberName: string) {
    try {
      await removeMember.mutateAsync(memberId);
      setPending(null);
      toast.success(`${memberName} removed from group`);
      announce(`${memberName} removed from the group`);
      // Let the dialog close and hand focus back first, then move it to the
      // member list heading, since the removed member's row is gone.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => headingRef.current?.focus())
      );
    } catch (e) {
      handleApiError(e, "Could not remove member");
      announce(`Could not remove ${memberName}`);
    }
  }

  const confirmBusy =
    (pending?.kind === "remove" && removeMember.isPending) ||
    (pending?.kind === "leave" && leave.isPending) ||
    (pending?.kind === "archive" && archive.isPending);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-sm uppercase tracking-widest text-ink/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-grape rounded"
        >
          {detail.members.length} member{detail.members.length === 1 ? "" : "s"}
        </h3>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setQrOpen(true)}
            aria-label="Share group QR code"
            data-testid="members-share-qr"
          >
            <QrCode className="h-4 w-4" aria-hidden /> Share QR
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
                    lockScroll
                    disabled={updateRole.isPending || removeMember.isPending}
                    trigger={(props, { open }) => (
                      <button
                        type="button"
                        {...props}
                        aria-label={`Manage ${m.user.displayName}, role ${ROLE_LABELS[m.role]}`}
                        data-testid={`member-actions-${m.id}`}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border-2 border-ink bg-paper px-3 py-1 text-xs font-bold shadow-brutal-sm transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40 hover:bg-cream"
                      >
                        {ROLE_LABELS[m.role]}
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  >
                    <div role="group" aria-label="Role">
                      <p
                        aria-hidden="true"
                        className="px-3 pb-1 pt-1 font-display text-[10px] uppercase tracking-widest text-ink/50"
                      >
                        Role
                      </p>
                      {ROLES.map((role) => (
                        <DropdownMenuRadioItem
                          key={role}
                          checked={m.role === role}
                          onSelect={() => handleRoleChange(m.id, m.user.displayName, role)}
                          textValue={ROLE_LABELS[role]}
                        >
                          <span className="text-sm font-bold">{ROLE_LABELS[role]}</span>
                        </DropdownMenuRadioItem>
                      ))}
                    </div>
                    <div role="separator" className="my-1 border-t-2 border-ink/20" />
                    <DropdownMenuItem
                      textValue="Remove from group"
                      onSelect={() =>
                        setPending({ kind: "remove", memberId: m.id, memberName: m.user.displayName })
                      }
                      className="text-cherry"
                    >
                      <UserMinus className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="text-sm font-bold">Remove from group</span>
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

      {(detail.pendingInvites?.length ?? 0) > 0 && (
        <div className="space-y-2" data-testid="pending-invites">
          <h3 className="font-display text-sm uppercase tracking-widest text-ink/60">
            Pending invites
          </h3>
          {detail.pendingInvites?.map((invite) => (
            <Card
              key={invite.id}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              data-testid="pending-invite"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-butter">
                  <UserPlus className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold">
                    {invite.pending ? "Sending invitation…" : "Invite sent"}
                  </p>
                  <p className="text-xs text-ink/50">
                    {invite.code ? (
                      <span className="font-mono">{invite.code}</span>
                    ) : (
                      "Awaiting invite code"
                    )}
                    {invite.expiresAt
                      ? ` · expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                      : " · never expires"}
                  </p>
                </div>
              </div>
              <div className="self-end sm:self-auto">
                <Badge tone="butter">Pending</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t-3 border-ink pt-5">
        {isAdmin && !detail.group.archived && (
          <Button variant="outline" onClick={() => setPending({ kind: "archive" })} loading={archive.isPending}>
            <Archive className="h-4 w-4" /> Archive group
          </Button>
        )}
        <Button variant="danger" onClick={() => setPending({ kind: "leave" })} loading={leave.isPending}>
          <LogOut className="h-4 w-4" /> Leave group
        </Button>
      </div>

      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="members-announcer"
      >
        {announcement}
      </p>

      <ConfirmDialog
        open={pending !== null}
        busy={confirmBusy}
        onCancel={() => setPending(null)}
        title={
          pending?.kind === "remove"
            ? "Remove member"
            : pending?.kind === "archive"
              ? "Archive group"
              : "Leave group"
        }
        description={
          pending?.kind === "remove"
            ? `Remove ${pending.memberName} from ${detail.group.name}? They lose access to the group's expenses and balances.`
            : pending?.kind === "archive"
              ? "Archive this group? Members keep read access to the ledger."
              : `Leave ${detail.group.name}? You'll need a new invite to rejoin.`
        }
        confirmLabel={
          pending?.kind === "remove" ? "Remove" : pending?.kind === "archive" ? "Archive" : "Leave"
        }
        destructive={pending?.kind !== "archive"}
        onConfirm={() => {
          if (pending?.kind === "remove") void handleRemoveMember(pending.memberId, pending.memberName);
          else if (pending?.kind === "archive") void handleArchive();
          else if (pending?.kind === "leave") void handleLeave();
        }}
      />

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        groupId={detail.group.id}
        groupName={detail.group.name}
      />

      <GroupInviteModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        groupId={detail.group.id}
        groupName={detail.group.name}
      />
    </div>
  );
}
