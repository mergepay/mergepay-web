"use client";

/**
 * Group invitation modal (#372).
 *
 * Onboarding friends and roommates should be effortless: an admin opens
 * this modal, generates one shareable deep link and copies it in a single
 * click. The link always carries the group id *and* an access token, so
 * whoever follows it lands on the right group's join flow.
 *
 * The token is minted by the API (`useCreateInvite`) and treated as
 * untrusted: the API's `url` is only rendered when it is a plain http(s)
 * URL, and the link is otherwise rebuilt locally from the group id and
 * the issued code. A locally generated token is used only as a last
 * resort so the modal never dead-ends on a malformed response.
 *
 * Copying goes through `copyTextToClipboard`, which falls back to the
 * legacy `execCommand` path, and every outcome is announced with a
 * `sonner` toast plus a visually hidden live region.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Link2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint } from "@/components/ui/input";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  buildInviteLink,
  describeInviteFailure,
  generateInviteToken,
  isSafeInviteUrl,
  isValidInviteCode,
} from "@/lib/inviteLink";
import { useCreateInvite } from "@/lib/queries";
import type { Invite } from "@/lib/types";

/** Which value was most recently copied, for the button's "Copied" state. */
type CopyTarget = "link" | "code";

export interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  /** Group the invite admits the visitor to. */
  groupId: string;
  /** Shown in the modal copy; purely cosmetic. */
  groupName?: string;
}

export function InviteMemberModal({
  open,
  onClose,
  groupId,
  groupName,
}: InviteMemberModalProps) {
  const createInvite = useCreateInvite(groupId);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [maxUses, setMaxUses] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("168");
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  // Only populated when the API hands back neither a safe URL nor a
  // valid code — see the `shareUrl` derivation below.
  const [fallbackToken, setFallbackToken] = useState<string | null>(null);

  // A closed-then-reopened modal starts from a clean slate, so a stale
  // link from the previous session is never copied by mistake.
  useEffect(() => {
    if (!open) {
      setInvite(null);
      setFallbackToken(null);
      setCopied(null);
    }
  }, [open]);

  // The "Copied" affordance is transient; the toast is the durable
  // confirmation.
  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  const origin = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    []
  );

  // Prefer the API's own link when it is safe to render; otherwise build
  // a deep link from the group id and the issued access token.
  const shareUrl = useMemo(() => {
    if (!invite) return null;
    if (isSafeInviteUrl(invite.url)) return invite.url;
    const token = isValidInviteCode(invite.code) ? invite.code : fallbackToken;
    if (!token) return null;
    return buildInviteLink({ baseUrl: origin, groupId, token });
  }, [invite, fallbackToken, origin, groupId]);

  async function generate() {
    try {
      const { invite: created } = await createInvite.mutateAsync({
        maxUses: maxUses ? Number(maxUses) : undefined,
        expiresInHours: expiresInHours ? Number(expiresInHours) : undefined,
      });
      setInvite(created);
      setFallbackToken(
        isSafeInviteUrl(created.url) || isValidInviteCode(created.code)
          ? null
          : generateInviteToken()
      );
    } catch (e) {
      toast.error(describeInviteFailure(e).description);
    }
  }

  async function copy(text: string, target: CopyTarget) {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopied(target);
      toast.success(
        target === "link" ? "Invite link copied to clipboard" : "Invite code copied to clipboard"
      );
    } else {
      toast.error(
        target === "link"
          ? "Could not copy the invite link. Select it and copy manually."
          : "Could not copy the invite code. Select it and copy manually."
      );
    }
  }

  const title = groupName ? `Invite to ${groupName}` : "Invite members";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description="Generate a shareable link and code that lets people join this group."
    >
      {!invite ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border-3 border-ink bg-grape-pale p-3 shadow-brutal-sm">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream">
              <UserPlus className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm text-ink/80">
              Anyone with the invite link or code can join this group. You can
              cap how many people use it and when it expires.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="invite-max-uses">Max uses</Label>
              <Input
                id="invite-max-uses"
                type="number"
                min="1"
                inputMode="numeric"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
            <div>
              <Label htmlFor="invite-expires">Expires in (hours)</Label>
              <Input
                id="invite-expires"
                type="number"
                min="1"
                inputMode="numeric"
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(e.target.value)}
                placeholder="Never"
              />
            </div>
          </div>
          <FieldHint>Leave a field blank for unlimited / never.</FieldHint>

          <div className="flex flex-col-reverse justify-end gap-2 pt-2 sm:flex-row">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={generate}
              loading={createInvite.isPending}
              data-autofocus
            >
              <Link2 className="h-4 w-4" aria-hidden="true" /> Generate invite
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <Label>Invite code</Label>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl border-3 border-ink bg-butter px-4 py-2.5 text-center font-mono text-lg font-bold tracking-widest shadow-brutal-sm">
                {invite.code}
              </code>
              <CopyControl
                label="Copy invite code"
                copied={copied === "code"}
                onCopy={() => void copy(invite.code, "code")}
                icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="invite-link">Share link</Label>
            {shareUrl ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id="invite-link"
                  readOnly
                  value={shareUrl}
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <CopyControl
                  label="Copy invite link"
                  copied={copied === "link"}
                  withText
                  onCopy={() => void copy(shareUrl, "link")}
                  icon={<Link2 className="h-4 w-4" aria-hidden="true" />}
                  data-autofocus
                />
              </div>
            ) : (
              <FieldHint>
                No share link is available for this invite — send the code
                above instead.
              </FieldHint>
            )}
          </div>

          <div className="flex flex-wrap justify-between gap-2 text-xs text-ink/50">
            <span>
              {invite.maxUses ? `${invite.maxUses} uses max` : "Unlimited uses"}
            </span>
            <span>
              {invite.expiresAt
                ? `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                : "Never expires"}
            </span>
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {copied === "link"
              ? "Invite link copied to clipboard"
              : copied === "code"
                ? "Invite code copied to clipboard"
                : ""}
          </p>

          <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
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

/**
 * Square copy affordance shared by the link and code fields. The visible
 * label (when present) swaps to "Copied" and the icon to a check, so the
 * feedback is never colour-only.
 */
function CopyControl({
  label,
  copied,
  onCopy,
  icon,
  withText = false,
  "data-autofocus": dataAutofocus,
}: {
  label: string;
  copied: boolean;
  onCopy: () => void;
  icon: React.ReactNode;
  withText?: boolean;
  "data-autofocus"?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size={withText ? "md" : "icon"}
      onClick={onCopy}
      aria-label={copied ? `${label.replace("Copy ", "")} copied` : label}
      data-autofocus={dataAutofocus ? true : undefined}
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        icon
      )}
      {withText && <span>{copied ? "Copied" : "Copy link"}</span>}
    </Button>
  );
}
