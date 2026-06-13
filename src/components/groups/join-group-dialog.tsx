"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useJoinGroup } from "@/lib/queries";
import { ApiRequestError } from "@/lib/api";

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    try {
      const { group } = await join.mutateAsync(code.trim());
      toast.success(`Joined ${group.name}`);
      onClose();
      router.push(`/groups/${group.id}`);
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.message : "Invalid or expired code");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Join a group">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="j-code">Invite code</Label>
          <Input
            id="j-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. 7QF3KD2P"
            className="font-mono uppercase tracking-widest"
            autoFocus
          />
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
