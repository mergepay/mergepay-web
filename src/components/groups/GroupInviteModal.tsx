"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, QrCode, RefreshCw } from "lucide-react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
// `qrcode.react`'s QRCodeSVG, loaded in its own chunk on first render (#707).
import { QRCodeSVG } from "@/components/ui/lazy-qr-code";
import { useClipboard } from "@/hooks/use-clipboard";
import { useCreateInvite } from "@/lib/queries";
import { buildInviteLink, describeInviteFailure, isSafeInviteUrl } from "@/lib/inviteLink";
import type { Invite } from "@/lib/types";
import { cn } from "@/lib/utils";

/** QR edge length in px — large enough to scan from across a table. */
export const INVITE_QR_SIZE = 220;

export interface GroupInviteModalProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName?: string;
  /**
   * Origin used when the API's share URL is missing or unsafe and the link
   * has to be rebuilt from the invite code. Defaults to the current origin.
   */
  baseUrl?: string;
}

/**
 * Resolve the URL to encode for an invite.
 *
 * Prefers the API's share URL when it passes `isSafeInviteUrl` (http/https,
 * no embedded credentials). Otherwise rebuilds the canonical
 * `/join/{token}?group={id}` deep link from the validated code, so a
 * compromised or buggy upstream can never get an executable URL into the QR
 * code or the clipboard. Returns `null` when neither is safe.
 */
export function resolveInviteUrl(
  invite: Pick<Invite, "code" | "url">,
  groupId: string,
  baseUrl: string | undefined
): string | null {
  if (isSafeInviteUrl(invite.url)) return invite.url;
  if (!baseUrl) return null;
  return buildInviteLink({ baseUrl, groupId, token: invite.code });
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; url: string; code: string }
  | { kind: "error"; message: string };

/**
 * QR invite modal for the group member-management view (#901).
 *
 * Opening it issues a fresh invite token for the group and renders the
 * invite link as a scannable QR code, so someone standing next to you can
 * join from their phone camera without typing anything. The same link can
 * be copied, with visible ("Copied" + check icon) and announced feedback.
 */
export function GroupInviteModal({
  open,
  onClose,
  groupId,
  groupName,
  baseUrl,
}: GroupInviteModalProps) {
  const createInvite = useCreateInvite(groupId);
  const { mutateAsync } = createInvite;
  const [state, setState] = useState<State>({ kind: "loading" });
  const { copied, copy } = useClipboard({ what: "invite link" });
  // One invite per opening: React strict mode re-runs effects, and a second
  // token would silently invalidate the QR the user is already showing.
  const requestedRef = useRef(false);

  const generate = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const { invite } = await mutateAsync({});
      const origin =
        baseUrl ?? (typeof window !== "undefined" ? window.location.origin : undefined);
      const url = resolveInviteUrl(invite, groupId, origin);
      if (!url) {
        setState({
          kind: "error",
          message: "The invite link we received was not valid. Try generating a new one.",
        });
        return;
      }
      setState({ kind: "ready", url, code: invite.code });
    } catch (error) {
      setState({ kind: "error", message: describeInviteFailure(error).description });
    }
  }, [mutateAsync, baseUrl, groupId]);

  useEffect(() => {
    if (!open) {
      requestedRef.current = false;
      return;
    }
    if (requestedRef.current) return;
    requestedRef.current = true;
    void generate();
  }, [open, generate]);

  return (
    <AccessibleDialog
      isOpen={open}
      onClose={onClose}
      title={groupName ? `Invite to ${groupName}` : "Invite with QR code"}
    >
      <div className="flex flex-col items-center gap-4" data-testid="group-invite-modal">
        <p className="text-center text-sm text-ink/70">
          Scan with a phone camera to open the invite and join the group.
        </p>

        <div
          className="flex items-center justify-center rounded-2xl border-3 border-ink bg-white p-3 shadow-brutal sm:p-4"
          style={{ minWidth: INVITE_QR_SIZE + 24, minHeight: INVITE_QR_SIZE + 24 }}
        >
          {state.kind === "loading" && (
            <div role="status" className="flex flex-col items-center gap-2">
              <Skeleton
                className="rounded-none"
                style={{ width: INVITE_QR_SIZE, height: INVITE_QR_SIZE }}
              />
              <span className="sr-only">Generating invite link…</span>
            </div>
          )}
          {state.kind === "ready" && (
            <QRCodeSVG
              value={state.url}
              size={INVITE_QR_SIZE}
              level="M"
              fgColor="#18130E"
              bgColor="#FFFFFF"
              marginSize={2}
              role="img"
              aria-label="QR code for the group invite link"
              data-testid="group-invite-qr"
              className="h-auto max-w-full"
            />
          )}
          {state.kind === "error" && (
            <div role="alert" className="flex max-w-[220px] flex-col items-center gap-3 text-center">
              <AlertTriangle className="h-6 w-6" aria-hidden />
              <p className="text-xs font-bold">{state.message}</p>
              <Button size="sm" variant="outline" onClick={() => void generate()}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again
              </Button>
            </div>
          )}
        </div>

        <div className="w-full space-y-1.5">
          <label
            htmlFor="group-invite-link"
            className="font-display text-xs uppercase tracking-widest text-ink/70"
          >
            Invite link
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <input
              id="group-invite-link"
              readOnly
              value={state.kind === "ready" ? state.url : ""}
              placeholder={state.kind === "loading" ? "Generating…" : ""}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-xl border-2 border-ink bg-paper px-3 py-2 font-mono text-xs shadow-brutal-sm focus:outline-none focus:ring-2 focus:ring-grape"
            />
            <Button
              size="sm"
              variant={copied ? "primary" : "outline"}
              disabled={state.kind !== "ready"}
              onClick={() => state.kind === "ready" && void copy(state.url)}
              aria-label={copied ? "Invite link copied" : "Copy invite link"}
              className={cn("shrink-0", copied && "bg-lime text-ink")}
              data-testid="group-invite-copy"
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
              {copied ? "Copied!" : "Copy link"}
            </Button>
          </div>
          <span className="sr-only" role="status" aria-live="polite">
            {copied ? "Invite link copied to clipboard" : ""}
          </span>
        </div>

        <div className="flex w-full items-center justify-between gap-2 border-t-2 border-ink/10 pt-3">
          <span className="flex items-center gap-1.5 text-[11px] text-ink/50">
            <QrCode className="h-3.5 w-3.5" aria-hidden />
            Each invite uses a fresh secure token.
          </span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </AccessibleDialog>
  );
}
