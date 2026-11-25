"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Clock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FormError } from "@/components/ui/input";
import { useJoinGroup, useInviteByCode } from "@/lib/queries";
import { describeInviteFailure, parseInviteCode } from "@/lib/inviteLink";

export function JoinGroupDialog({
  open,
  onClose,
  initialCode = "",
}: {
  open: boolean;
  onClose: () => void;
  initialCode?: string;
}) {
  const router = useRouter();
  const join = useJoinGroup();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);

  // When a code is provided, fetch invite details to show group identity.
  const parsed = parseInviteCode(code);
  const validCode = parsed.ok ? parsed.code : null;
  const inviteQuery = useInviteByCode(validCode);
  const invite = inviteQuery.data?.invite;
  const inviteError = inviteQuery.isError;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (join.isPending) return;

    // Reject malformed codes locally — no membership request is issued
    // for input that cannot be a valid identifier.
    const parsed = parseInviteCode(code);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }

    setError(null);
    try {
      const { group } = await join.mutateAsync(parsed.code);
      toast.success(`Joined ${group.name}`);
      onClose();
      router.push(`/groups/${group.id}`);
    } catch (e) {
      const recovery = describeInviteFailure(e);
      setError(recovery.description);
      toast.error(recovery.title);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Join a group"
      description="Enter an invite code to join an existing group."
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="j-code">Invite code</Label>
          <Input
            id="j-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. 7QF3KD2P"
            className="font-mono uppercase tracking-widest"
            data-autofocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "j-code-error" : undefined}
          />
          {error && (
            <div id="j-code-error" role="alert">
              <FormError>{error}</FormError>
            </div>
          )}
        </div>

        {invite && (
          <div className="space-y-2 rounded-xl border-2 border-ink bg-cream p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-ink/60">
              Invite details
            </p>
            {invite.groupId && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-grape" aria-hidden="true" />
                <span className="text-sm">Group: {invite.groupId}</span>
              </div>
            )}
            {invite.expiresAt && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-tangerine" aria-hidden="true" />
                <span className="text-sm">
                  Expires {new Date(invite.expiresAt).toLocaleDateString()}
                </span>
              </div>
            )}
            {invite.maxUses && (
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-aqua" aria-hidden="true" />
                <span className="text-sm">
                  {invite.maxUses - invite.uses} of {invite.maxUses} uses remaining
                </span>
              </div>
            )}
          </div>
        )}

        {inviteError && validCode && (
          <div className="rounded-xl border-2 border-ink bg-flamingo-pale p-3 text-sm" role="alert">
            Could not load invite details. You can still try to join.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={join.isPending} disabled={!code.trim()}>
            Join group
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
