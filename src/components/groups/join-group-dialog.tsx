"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FormError } from "@/components/ui/input";
import { useJoinGroup } from "@/lib/queries";
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
