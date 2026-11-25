"use client";

/**
 * TrustlinePromptModal (#545 progress states).
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
 *     drives the full flow through `useTrustlineSubmission`.
 *  3. Shows which leg of that flow the user is on — building, waiting for the
 *     Freighter signature, submitting, then waiting for the network to confirm
 *     — in a live region, with a progress bar across the four.
 *  4. Reports a failed leg with the recovery that fits it (try again, reconnect,
 *     install, or "check again" for a transaction we already submitted), plus
 *     the transaction hash in the explorer once there is one.
 *  5. Once all required trustlines are established on-chain, invokes `onReady`
 *     so the caller can unblock the settlement flow.
 *
 * The ready state now follows the network rather than the submit call:
 * `addTrustline` resolves as soon as Horizon accepts the envelope, and a
 * trustline that isn't visible on the account yet cannot receive USDC.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCcw,
  SearchCheck,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TxLink } from "@/components/tx-link";
import { TxPhaseLine, TxProgress } from "@/components/ui/tx-progress";
import { FREIGHTER_INSTALL_URL, hasTrustline } from "@/lib/stellar";
import { useTrustlineSubmission } from "@/hooks/useTrustlineSubmission";
import { SUBMISSION_STEPS, isInFlightPhase, type SubmissionRecovery } from "@/lib/walletSubmission";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrustlineAssetInfo {
  code: string;
  issuer: string | null;
  name?: string;
}

export type TrustlineStatus =
  | "checking"
  | "ready"
  | "missing"
  | "adding"
  | "confirming"
  | "error";

export interface TrustlineEntry {
  asset: TrustlineAssetInfo;
  status: TrustlineStatus;
  /** Human-readable error when status is "error". */
  error?: string;
  /** Hash of the transaction this asset's trustline was submitted in. */
  txHash?: string | null;
  /**
   * The recovery that fits the failure: retry the flow, reconnect the wallet,
   * install Freighter, or just re-check a transaction already submitted.
   */
  recovery?: SubmissionRecovery;
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
  poll,
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
  /**
   * Confirmation poll cadence. The app leaves this alone; tests tighten it so
   * the slow-confirmation path can be exercised without waiting out the real
   * 45s window — the same override `SettlementModal` exposes as `timeouts`.
   */
  poll?: { timeoutMs?: number; intervalMs?: number };
}) {
  const [entries, setEntries] = useState<TrustlineEntry[]>(() =>
    assets.map((asset) => ({ asset, status: "checking" as const }))
  );

  // Track whether we already ran the initial check to avoid re-checking
  // when the modal stays open while entries update.
  const hasCheckedRef = useRef(false);

  // Mark an asset settled once the network has shown its trustline.
  const submission = useTrustlineSubmission({
    publicKey,
    poll,
    onConfirmed: ({ code, txHash }) => {
      setEntries((prev) =>
        prev.map((e) =>
          e.asset.code === code
            ? { ...e, status: "ready" as const, error: undefined, txHash, recovery: undefined }
            : e
        )
      );
      toast.success(`${code} trustline enabled`);
    },
  });

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

  // Fold the live submission into the rows it concerns, so a row knows whether
  // it is waiting on a leg of *this* attempt rather than a previous one.
  const rows: TrustlineEntry[] = entries.map((entry) => {
    const isActive = submission.target?.code === entry.asset.code;
    if (!isActive) return entry;
    if (submission.failure) {
      return {
        ...entry,
        status: "error" as const,
        error: `${submission.failure.title}: ${submission.failure.message}`,
        txHash: submission.failure.txHash ?? entry.txHash,
        recovery: submission.failure.recovery,
      };
    }
    if (submission.phase === "confirmed") {
      return { ...entry, status: "ready" as const, error: undefined };
    }
    if (isInFlightPhase(submission.phase)) {
      return {
        ...entry,
        // "adding" covers build/sign/submit; "confirming" is the poll. They read
        // differently to a user ("approve it in Freighter" vs "almost there"),
        // so they stay separate states rather than one spinner.
        status: submission.phase === "confirming" ? "confirming" : "adding",
        txHash: submission.txHash ?? entry.txHash,
      };
    }
    return entry;
  });

  // ------------------------------------------------------------------
  // Add trustline
  // ------------------------------------------------------------------

  const addTrustlineForAsset = useCallback(
    (asset: TrustlineAssetInfo) => {
      if (!asset.issuer) return;
      submission.submit({ code: asset.code, issuer: asset.issuer });
    },
    [submission]
  );

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <Dialog
      open={open}
      onClose={onClose}
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
          {rows.map((entry) => (
            <TrustlineAssetRow
              key={`${entry.asset.code}-${entry.asset.issuer}`}
              entry={entry}
              active={submission.target?.code === entry.asset.code}
              progress={{
                steps: SUBMISSION_STEPS,
                completed: submission.completed,
                label: submission.label ?? "",
              }}
              onAdd={() => addTrustlineForAsset(entry.asset)}
              onCheckAgain={submission.checkAgain}
              disabled={allReady || submission.busy}
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
  active,
  progress,
  onAdd,
  onCheckAgain,
  disabled,
}: {
  entry: TrustlineEntry;
  /** Whether the shared submission is working on this asset right now. */
  active: boolean;
  /** Live progress for the active submission (only read when `active`). */
  progress: { steps: typeof SUBMISSION_STEPS; completed: number; label: string };
  onAdd: () => void;
  onCheckAgain: () => void;
  disabled: boolean;
}) {
  const { asset, status, error, txHash, recovery } = entry;
  const isNative = !asset.issuer;
  const inFlight = status === "adding" || status === "confirming";
  // The live region below the progress bar narrates the current leg — or the
  // failure — for the asset the submission is working on. Showing the same
  // sentence in the row's error slot too would put it on screen twice.
  const narrated = active && !isNative && (inFlight || status === "error");

  return (
    <div className="rounded-xl border-2 border-ink bg-paper px-4 py-3">
      <div className="flex items-center justify-between gap-3">
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
              {status === "confirming" && <Badge tone="butter">Confirming…</Badge>}
              {status === "error" && (
                <Badge tone="flamingo">{recovery === "check" ? "Unconfirmed" : "Failed"}</Badge>
              )}
            </div>
            {asset.issuer && (
              <p className="mt-0.5 truncate font-mono text-[10px] text-ink/40">
                {asset.issuer}
              </p>
            )}
            {error && !narrated && (
              <p className="mt-1 text-xs text-flamingo">{error}</p>
            )}
          </div>
        </div>

        {/* Action */}
        <div className="shrink-0">
          {isNative ? (
            <span className="text-xs text-ink/40">No setup needed</span>
          ) : status === "ready" ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-lime-dark" />
              {txHash && <TxLink hash={txHash} />}
            </div>
          ) : status === "confirming" ? (
            <Loader2 className="h-5 w-5 animate-spin text-grape" aria-label="Confirming on the network" />
          ) : status === "adding" ? (
            <Loader2 className="h-5 w-5 animate-spin text-grape" aria-label="Waiting for Freighter" />
          ) : status === "error" ? (
            <FailedAction
              recovery={recovery}
              onAdd={onAdd}
              onCheckAgain={onCheckAgain}
              disabled={disabled}
            />
          ) : (
            <Button size="sm" onClick={onAdd} disabled={disabled}>
              <Wallet className="h-3.5 w-3.5" /> Enable
            </Button>
          )}
        </div>
      </div>

      {/* Leg-by-leg progress for the asset being worked on. */}
      {narrated && (
        <div className="mt-3 space-y-2">
          <TxProgress
            steps={progress.steps}
            completed={progress.completed}
            errored={status === "error"}
            label={`${asset.code} trustline progress`}
          />
          <TxPhaseLine
            text={
              status === "error"
                ? error ?? "This attempt did not complete."
                : progress.label
            }
            state={status === "error" ? "error" : "busy"}
          >
            {txHash && <TxLink hash={txHash} />}
          </TxPhaseLine>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: the recovery a failed row offers
// ---------------------------------------------------------------------------

/**
 * A failed attempt offers the action that fits *why* it failed, which is the
 * difference between a recovery and a dead end:
 *
 *  - `check` — the transaction went to the network but the trustline isn't
 *    visible yet. Re-poll only: starting over would build and sign a *second*
 *    `changeTrust`, and the first one may still land.
 *  - `install` — there is no wallet to sign anything, so offer to get one.
 *  - `reconnect` / `retry` — Freighter declined, locked, or the leg failed in a
 *    way a fresh attempt can clear.
 */
function FailedAction({
  recovery,
  onAdd,
  onCheckAgain,
  disabled,
}: {
  recovery?: SubmissionRecovery;
  onAdd: () => void;
  onCheckAgain: () => void;
  disabled: boolean;
}) {
  if (recovery === "check") {
    return (
      <Button size="sm" variant="outline" onClick={onCheckAgain} disabled={disabled}>
        <SearchCheck className="h-3.5 w-3.5" /> Check again
      </Button>
    );
  }

  if (recovery === "install") {
    return (
      <a href={FREIGHTER_INSTALL_URL} target="_blank" rel="noopener noreferrer" className="inline-flex">
        <Button size="sm" variant="outline">
          <ExternalLink className="h-3.5 w-3.5" /> Install Freighter
        </Button>
      </a>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={onAdd} disabled={disabled}>
      <RefreshCcw className="h-3.5 w-3.5" />
      {recovery === "reconnect" ? "Reconnect wallet" : "Try again"}
    </Button>
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
    case "confirming":
      return <Loader2 className={`${className} animate-spin text-grape`} />;
    case "error":
      return <AlertTriangle className={`${className} text-flamingo`} />;
    default:
      return <Wallet className={className} />;
  }
}
