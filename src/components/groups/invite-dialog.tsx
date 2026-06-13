"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint } from "@/components/ui/input";
import { CopyButton } from "@/components/ui/copy-button";
import { useCreateInvite } from "@/lib/queries";
import { ApiRequestError } from "@/lib/api";
import type { Invite } from "@/lib/types";

export function InviteDialog({
  open,
  onClose,
  groupId,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
}) {
  const createInvite = useCreateInvite(groupId);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [maxUses, setMaxUses] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("168");

  useEffect(() => {
    if (!open) setInvite(null);
  }, [open]);

  async function generate() {
    try {
      const { invite } = await createInvite.mutateAsync({
        maxUses: maxUses ? Number(maxUses) : undefined,
        expiresInHours: expiresInHours ? Number(expiresInHours) : undefined,
      });
      setInvite(invite);
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.message : "Could not create invite");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Invite members">
      {!invite ? (
        <div className="space-y-4">
          <p className="text-sm text-ink/60">
            Generate a shareable invite link and code. Anyone with it can join
            this group.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="i-max">Max uses</Label>
              <Input
                id="i-max"
                type="number"
                min="1"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
            <div>
              <Label htmlFor="i-exp">Expires in (hours)</Label>
              <Input
                id="i-exp"
                type="number"
                min="1"
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(e.target.value)}
                placeholder="Never"
              />
            </div>
          </div>
          <FieldHint>Leave a field blank for unlimited / never.</FieldHint>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={generate} loading={createInvite.isPending}>
              Generate invite
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex justify-center">
            <div className="rounded-2xl border-3 border-ink bg-white p-4 shadow-brutal">
              <QRCodeSVG value={invite.url} size={160} fgColor="#18130E" />
            </div>
          </div>
          <div>
            <Label>Invite code</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-xl border-3 border-ink bg-butter px-4 py-2.5 text-center font-mono text-lg font-bold tracking-widest shadow-brutal-sm">
                {invite.code}
              </code>
              <CopyButton value={invite.code} label="Copy" />
            </div>
          </div>
          <div>
            <Label>Share link</Label>
            <div className="flex items-center gap-2">
              <Input readOnly value={invite.url} className="font-mono text-xs" />
              <CopyButton value={invite.url} />
            </div>
          </div>
          <div className="flex justify-between text-xs text-ink/50">
            <span>
              {invite.maxUses ? `${invite.maxUses} uses max` : "Unlimited uses"}
            </span>
            <span>
              {invite.expiresAt
                ? `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                : "Never expires"}
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setInvite(null)}>
              New invite
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
