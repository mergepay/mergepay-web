"use client";

/**
 * TrustlinePromptModal
 *
 * Interactive modal that detects missing Stellar trustlines for the target
 * asset and allows the user to establish them directly through Freighter
 * before executing a settlement payment.
 *
 * When a settlement targets a non-native asset (e.g. USDC), the wallet
 * must hold an active trustline for that asset. This modal:
 *
 *  1. Checks whether the wallet already has the required trustline.
 *  2. If missing, displays an explanation and an "Enable" button that
 *     builds a `changeTrust` transaction, asks Freighter to sign it,
 *     and submits the signed envelope to Horizon.
 *  3. Shows real-time status (checking → ready / error) for each asset.
 *  4. Once all required trustlines are established, invokes `onReady`
 *     so the caller can unblock the settlement flow.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  addTrustline,
  hasTrustline,
  WalletError,
  type WalletErrorCode,
} from "@/lib/stellar";
import { FREIGHTER_INSTALL_URL } from "@/lib/stellar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrustlineAssetInfo {
  code: string;
  issuer: string | null;
  name?: string;
}

export type TrustlineStatus = "checking" | "ready" | "missing" | "adding" | "error";

export interface TrustlineEntry {
  asset: TrustlineAssetInfo;
  status: TrustlineStatus;
  /** Human-readable error when status is "error". */
  error?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TrustlinePromptModal({
  open,
  onClose,
  publicKey,
  assets,
  onReady,
}: {
  /** Whether the modal is visible. */
  open: boolean;
  /** Called when the user closes the modal. */
  onClose: () => void;
  /** The connected wallet's Stellar public key. */
  publicKey: string;
  /** Assets that need trustlines (typically the settlement target asset). */
  assets: TrustlineAssetInfo[];
  /** Called when all required trustlines are established. */
  onReady: () => void;
}) {
  const [entries, setEntries] = useState<TrustlineEntry[]>(() =>
    assets.map((asset) => ({ asset, status: "checking" as const }))
  );

  // Track whether we already ran the initial check to avoid re-checking
  // when the modal stays open while entries update.
  const hasCheckedRef = useRef(false);

  // ------------------------------------------------------------------
  // Initial check
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!open || !publicKey || hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    let cancelled = false;

    async function checkAll() {
      const results = await Promise.all(
        assets.map(async (asset) => {
          if (!asset.issuer) {
            return { asset, status: "ready" as const };
          }
          try {
            const present = await hasTrustline(publicKey, asset.code, asset.issuer);
            return {
              asset,
              status: present ? ("ready" as const) : ("missing" as const),
            };
          } catch {
            return {
              asset,
              status: "error" as const,
              error: "Could not verify trustline status.",
            };
          }
        })
      );

      if (!cancelled) {
        setEntries(results);
      }
    }

    void checkAll();
    return () => { cancelled = true; };
  }, [open, publicKey, assets]);

  // Reset check flag when modal closes
  useEffect(() => {
    if (!open) {
      hasCheckedRef.current = false;
    }
  }, [open]);

  // ------------------------------------------------------------------
  // Auto-ready
  // ------------------------------------------------------------------

  // When all entries reach "ready", notify the parent.
  const allReady = entries.length > 0 && entries.every((e) => e.status === "ready");
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (allReady && !notifiedRef.current) {
      notifiedRef.current = true;
      onReady();
    }
    if (!allReady) {
      notifiedRef.current = false;
    }
  }, [allReady, onReady]);

  // ------------------------------------------------------------------
  // Add trustline
  // ------------------------------------------------------------------

  const addTrustlineForAsset = useCallback(
    async (index: number) => {
      const entry = entries[index];
      if (!entry || entry.status === "ready" || entry.status === "adding") return;
      if (!entry.asset.issuer) return;

      setEntries((prev) =>
        prev.map((e, i) => (i === index ? { ...e, status: "adding" as const, error: undefined } : e))
      );

      try {
        await addTrustline(publicKey, entry.asset.code, entry.asset.issuer);
        setEntries((prev) =>
          prev.map((e, i) => (i === index ? { ...e, status: "ready" as const, error: undefined } : e))
        );
        toast.success(`${entry.asset.code} trustline enabled`);
      } catch (err) {
        const message =
          err instanceof WalletError
            ? err.code === "user_rejected"
              ? "You cancelled the trustline setup. The settlement cannot proceed without this trustline."
              : err.message
            : "Trustline setup failed. Please try again.";

        setEntries((prev) =>
          prev.map((e, i) => (i === index ? { ...e, status: "error" as const, error: message } : e))
        );
      }
    },
    [entries, publicKey]
  );

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const missingCount = entries.filter((e) => e.status === "missing" || e.status === "error").length;
  const hasAny = entries.some((e) => e.status !== "ready");

  return (
    <Dialog
      open={open}
      onClose={hasAny ? onClose : onClose}
      title="Trustline Setup Required"
      description="Your wallet needs trustlines for the target asset before it can settle this payment. Establish them now through Freighter."
    >
      <div className="space-y-4">
        {/* Explanation */}
        <div className="rounded-xl border-2 border-ink bg-butter-pale px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-grape" />
            <div>
              <p className="font-display text-[11px] uppercase tracking-widest text-ink/50">
                What is a trustline?
              </p>
              <p className="mt-1 text-ink/70">
                Stellar accounts need a trustline to hold non-native assets like
                USDC. This is a one-time setup per asset — once enabled, your
                wallet can receive and send that asset.
              </p>
            </div>
          </div>
        </div>

        {/* Asset rows */}
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <TrustlineAssetRow
              key={`${entry.asset.code}-${entry.asset.issuer}`}
              entry={entry}
              onAdd={() => addTrustlineForAsset(i)}
              disabled={allReady}
            />
          ))}
        </div>

        {/* Status summary */}
        {allReady && (
          <div className="flex items-center gap-2 rounded-xl border-2 border-ink bg-lime px-4 py-3 text-sm">
            <CheckCircle2 className="h-5 w-5 text-ink" />
            <span className="font-medium">All trustlines are ready. You can proceed with settlement.</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {allReady && (
            <Button onClick={onClose}>
              <CheckCircle2 className="h-4 w-4" /> Continue to Settlement
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: single asset row
// ---------------------------------------------------------------------------

function TrustlineAssetRow({
  entry,
  onAdd,
  disabled,
}: {
  entry: TrustlineEntry;
  onAdd: () => void;
  disabled: boolean;
}) {
  const { asset, status, error } = entry;
  const isNative = !asset.issuer;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink bg-paper px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* Status icon */}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream">
          <StatusIcon status={status} />
        </span>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm uppercase tracking-tight">
              {asset.code}
            </span>
            {asset.name && asset.name !== asset.code && (
              <span className="text-xs text-ink/50">({asset.name})</span>
            )}
            {isNative && <Badge tone="lime">Native</Badge>}
            {status === "ready" && <Badge tone="lime">Active</Badge>}
            {status === "missing" && <Badge tone="tangerine">Missing</Badge>}
            {status === "adding" && <Badge tone="butter">Enabling…</Badge>}
            {status === "error" && <Badge tone="flamingo">Failed</Badge>}
          </div>
          {asset.issuer && (
            <p className="mt-0.5 truncate font-mono text-[10px] text-ink/40">
              {asset.issuer}
            </p>
          )}
          {error && (
            <p className="mt-1 text-xs text-flamingo">{error}</p>
          )}
        </div>
      </div>

      {/* Action */}
      <div className="shrink-0">
        {isNative ? (
          <span className="text-xs text-ink/40">No setup needed</span>
        ) : status === "ready" ? (
          <CheckCircle2 className="h-5 w-5 text-lime-dark" />
        ) : status === "adding" ? (
          <Loader2 className="h-5 w-5 animate-spin text-grape" />
        ) : (
          <Button
            size="sm"
            onClick={onAdd}
            disabled={disabled}
          >
            <Wallet className="h-3.5 w-3.5" /> Enable
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: status icon
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: TrustlineStatus }) {
  const className = "h-4 w-4";
  switch (status) {
    case "checking":
      return <Loader2 className={`${className} animate-spin`} />;
    case "ready":
      return <CheckCircle2 className={`${className} text-lime-dark`} />;
    case "missing":
      return <AlertTriangle className={`${className} text-tangerine-dark`} />;
    case "adding":
      return <Loader2 className={`${className} animate-spin text-grape`} />;
    case "error":
      return <AlertTriangle className={`${className} text-flamingo`} />;
    default:
      return <Wallet className={className} />;
  }
}
