"use client";

/**
 * AnchorModal
 *
 * SEP-24 deposit / withdrawal modal. Fetches the anchor catalogue via the
 * `useAnchorInfo` React Query hook, lets the user pick an anchor that supports
 * the requested asset, and starts an interactive SEP-24 session through the
 * Mergepay API.
 *
 * The Dialog primitive owns focus trapping, Escape-to-close and keyboard
 * navigation; this component adds the anchor-specific loading / error /
 * session-start states and stays responsive on mobile viewports.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, ExternalLink, Loader2, RefreshCw, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AssetBadge } from "@/components/asset-badge";
import { useAnchorInfo, findAnchorForAsset, anchorSupportsAsset } from "@/lib/anchorInfo";
import { api } from "@/lib/api";
import type { AnchorSession, AnchorSessionKind } from "@/lib/types";

export interface AnchorModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Called when the user closes the modal. */
  onClose: () => void;
  /** Asset to deposit or withdraw (e.g. "USDC"). */
  assetCode: string;
  /** Direction of the SEP-24 flow. */
  kind: AnchorSessionKind;
  /** Optional preferred anchor name (used to disambiguate). */
  preferredAnchorName?: string | null;
  /** Called with the started session so callers can track status. */
  onSessionStarted?: (session: AnchorSession) => void;
}

export function AnchorModal({
  open,
  onClose,
  assetCode,
  kind,
  preferredAnchorName,
  onSessionStarted,
}: AnchorModalProps) {
  const { anchors, isLoading, isError, refetch } = useAnchorInfo(assetCode);
  const [starting, setStarting] = useState(false);
  const [selectedAnchor, setSelectedAnchor] = useState<string | null>(null);

  // useAnchorInfo already narrows the catalogue to anchors supporting the
  // requested asset; the memo keeps a stable reference for the picker list.
  const matchingAnchors = useMemo(
    () => anchors.filter((a) => anchorSupportsAsset(a, assetCode)),
    [anchors, assetCode]
  );

  const chosenAnchor = useMemo(
    () =>
      findAnchorForAsset(matchingAnchors, assetCode, selectedAnchor ?? preferredAnchorName),
    [matchingAnchors, assetCode, selectedAnchor, preferredAnchorName]
  );

  async function handleStart() {
    if (!chosenAnchor) return;
    setStarting(true);
    try {
      const payload = { assetCode, anchorName: chosenAnchor.name };
      const response =
        kind === "deposit"
          ? await api.anchorDeposit(payload)
          : await api.anchorWithdraw(payload);
      toast.success(
        `${kind === "deposit" ? "Deposit" : "Withdrawal"} session started with ${chosenAnchor.name}`
      );
      onSessionStarted?.(response.session);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Could not start the SEP-24 session.";
      toast.error(message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${kind === "deposit" ? "Deposit" : "Withdraw"} ${assetCode}`}
      description={`SEP-24 ${kind} flow — secure, anchor-hosted transfer`}
    >
      <div className="space-y-4">
        {/* Direction header */}
        <div className="flex items-center gap-3 rounded-xl border-3 border-ink bg-paper p-3.5 shadow-brutal-sm">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 border-ink ${
              kind === "deposit" ? "bg-lime" : "bg-aqua"
            }`}
          >
            {kind === "deposit" ? (
              <ArrowDownToLine className="h-4 w-4 text-ink" />
            ) : (
              <ArrowUpFromLine className="h-4 w-4 text-ink" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xs font-bold uppercase tracking-wider text-ink">
              {kind === "deposit" ? "Fund your balance" : "Withdraw to fiat"}
            </p>
            <p className="text-xs text-ink/60">
              The anchor will host a secure interactive transfer.
            </p>
          </div>
          <AssetBadge code={assetCode} />
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-ink bg-cream p-4 text-sm text-ink/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading anchor options…</span>
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink bg-flamingo-pale p-3.5 text-xs font-bold"
          >
            <span className="flex items-center gap-2 text-ink">
              <AlertTriangle className="h-4 w-4 shrink-0 text-flamingo" />
              Could not load anchor information.
            </span>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              <RefreshCw className="h-3 w-3" /> Retry
            </Button>
          </div>
        )}

        {/* No anchors found */}
        {!isLoading && !isError && matchingAnchors.length === 0 && (
          <div
            role="alert"
            className="rounded-xl border-2 border-ink bg-butter-pale p-4 text-xs text-ink/75"
          >
            No anchors currently support{" "}
            <span className="font-bold text-grape">{assetCode}</span>. Try a
            different asset or check back later.
          </div>
        )}

        {/* Anchor picker */}
        {!isLoading && !isError && matchingAnchors.length > 0 && (
          <div className="space-y-2">
            <p className="font-display text-xs uppercase tracking-widest text-ink/60">
              Choose an anchor
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {matchingAnchors.map((anchor) => {
                const selected = chosenAnchor?.name === anchor.name;
                return (
                  <li key={anchor.homeDomain}>
                    <button
                      type="button"
                      onClick={() => setSelectedAnchor(anchor.name)}
                      aria-pressed={selected}
                      className={`w-full rounded-xl border-3 border-ink p-3 text-left transition-all duration-100 ${
                        selected
                          ? "bg-paper shadow-brutal-lg -translate-y-0.5"
                          : "bg-cream hover:bg-paper shadow-brutal-sm"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-display text-sm font-bold text-ink">
                          {anchor.name}
                        </span>
                        {selected && (
                          <Badge tone="lime" className="shrink-0">
                            Selected
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-ink/50">
                        {anchor.homeDomain}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={starting}>
            Close
          </Button>
          <Button
            onClick={() => void handleStart()}
            disabled={!chosenAnchor || starting}
            loading={starting}
          >
            {starting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : chosenAnchor ? (
              <Rocket className="h-4 w-4" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            {kind === "deposit" ? "Start Deposit" : "Start Withdrawal"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
