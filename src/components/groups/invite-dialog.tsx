"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint } from "@/components/ui/input";
import CopyButton from "@/components/ui/CopyButton";
import { useCreateInvite } from "@/lib/queries";
import { describeInviteFailure, isSafeInviteUrl } from "@/lib/inviteLink";
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
  const [shareSupported, setShareSupported] = useState(false);

  useEffect(() => {
    if (!open) setInvite(null);
  }, [open]);

  useEffect(() => {
    setShareSupported(typeof navigator !== "undefined" && "share" in navigator);
  }, []);

  async function generate() {
    try {
      const { invite } = await createInvite.mutateAsync({
        maxUses: maxUses ? Number(maxUses) : undefined,
        expiresInHours: expiresInHours ? Number(expiresInHours) : undefined,
      });
      setInvite(invite);
    } catch (e) {
      toast.error(describeInviteFailure(e).description);
    }
  }

  // A share link is only rendered — as a QR code, a copyable value, or
  // text — once it is a plain http(s) URL without embedded credentials.
  // The invite code itself is always safe to show.
  const shareUrl = invite && isSafeInviteUrl(invite.url) ? invite.url : null;

  async function shareInvite() {
    if (!shareUrl || typeof navigator === "undefined" || !navigator.share) return;
    await navigator.share({ title: "Join my MergePay group", url: shareUrl });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Invite members"
      description="Generate a shareable code and link that lets people join this group."
    >
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
          {shareUrl && (
            <div className="flex justify-center">
              <div className="rounded-2xl border-3 border-ink bg-white p-4 shadow-brutal">
                <QRCodeSVG value={shareUrl} size={160} fgColor="#18130E" />
              </div>
            </div>
          )}
          {shareUrl && shareSupported && (
            <Button variant="outline" onClick={() => void shareInvite()}>
              <Share2 className="h-4 w-4" /> Share invite
            </Button>
          )}
          <div>
            <Label>Invite code</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-xl border-3 border-ink bg-butter px-4 py-2.5 text-center font-mono text-lg font-bold tracking-widest shadow-brutal-sm">
                {invite.code}
              </code>
              <CopyButton text={invite.code} label="Copy" />
            </div>
          </div>
          <div>
            <Label>Share link</Label>
            {shareUrl ? (
              <div className="flex items-center gap-2">
                <Input readOnly value={shareUrl} className="font-mono text-xs" />
                <CopyButton text={shareUrl} />
              </div>
            ) : (
              <FieldHint>
                No share link is available for this invite — send the code above
                instead.
              </FieldHint>
            )}
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

/** Issue-facing name retained alongside the existing dialog name. */
export const InviteModal = InviteDialog;
