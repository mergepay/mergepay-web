"use client";

/**
 * Sep24Modal
 *
 * Dedicated SEP-24 anchor on/off-ramp modal (#374).
 *
 * Drives the full fiat deposit / withdrawal flow without leaving the app:
 *
 *   1. Fetch the anchor catalogue and narrow it to anchors that support the
 *      requested asset (`useAnchorInfo` → `GET /anchors`).
 *   2. Start a session (`POST /anchors/deposit` | `/anchors/withdraw`), which
 *      returns the SEP-24 session plus a SEP-10 challenge from the anchor.
 *   3. Sign the challenge in the user's wallet (Freighter) — the private key
 *      never touches Mergepay.
 *   4. Exchange the signed challenge for the anchor's interactive URL
 *      (`POST /anchors/sessions/:id/complete`).
 *   5. Orchestrate the hosted UI securely: embed the HTTPS URL in a sandboxed
 *      iframe, fall back to a hardened popup when the anchor forbids framing,
 *      and poll the session until it reaches a terminal state.
 *
 * The Dialog primitive owns focus trapping, Escape-to-close and keyboard
 * navigation; this component adds the anchor-specific loading / error /
 * interactive states and stays responsive on mobile viewports.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  Lock,
  RefreshCw,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/badge";
import { AssetBadge } from "@/components/asset-badge";
import {
  anchorSupportsAsset,
  findAnchorForAsset,
  useAnchorInfo,
} from "@/lib/anchorInfo";
import { useAnchorSession } from "@/lib/queries";
import { api } from "@/lib/api";
import { handleApiError } from "@/lib/errorHandler";
import { useAuth } from "@/lib/auth-store";
import { signXdr, WalletError, NotInstalledMessage } from "@/lib/stellar";
import { isTerminalAnchorStatus, mapAnchorStatusToUiState, getStateDescription } from "@/lib/anchor-state";
import type {
  AnchorInteractiveInfo,
  AnchorSession,
  AnchorSessionKind,
} from "@/lib/types";

export interface Sep24ModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Called when the user closes the modal. */
  onClose: () => void;
  /** Direction of the SEP-24 flow. */
  kind: AnchorSessionKind;
  /** Asset to deposit or withdraw. Defaults to USDC. */
  assetCode?: string;
  /** Optional preferred anchor name (used to disambiguate). */
  preferredAnchorName?: string | null;
  /** Called with the started session so callers can track status. */
  onSessionStarted?: (session: AnchorSession) => void;
  /** Called once the session reaches a terminal state. */
  onCompleted?: (session: AnchorSession) => void;
}

/**
 * Only HTTPS anchor URLs may be embedded or opened. Anything else (plain
 * HTTP, `javascript:`, malformed) is rejected so a malicious or
 * misconfigured anchor cannot be loaded into the app origin.
 */
export function isSecureAnchorUrl(
  url: string | null | undefined
): url is string {
  if (!url) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Open the anchor's interactive UI in a hardened popup window.
 *
 * `noopener,noreferrer` severs the `window.opener` reference so the
 * third-party anchor cannot navigate or otherwise reach back into the app.
 * Returns `null` when the browser blocks the popup.
 */
export function openAnchorPopup(url: string): Window | null {
  if (typeof window === "undefined") return null;
  return window.open(
    url,
    "mergepay-sep24-anchor",
    "noopener,noreferrer,width=480,height=760"
  );
}

export function Sep24Modal({
  open,
  onClose,
  kind,
  assetCode = "USDC",
  preferredAnchorName,
  onSessionStarted,
  onCompleted,
}: Sep24ModalProps) {
  const token = useAuth((s) => s.token);
  const authenticated = Boolean(token);

  const { anchors, isLoading, isError, refetch } = useAnchorInfo(assetCode);
  const [starting, setStarting] = useState(false);
  const [selectedAnchor, setSelectedAnchor] = useState<string | null>(null);
  const [interactive, setInteractive] = useState<AnchorInteractiveInfo | null>(
    null
  );
  const [embedBlocked, setEmbedBlocked] = useState(false);
  const notifiedRef = useRef(false);

  const matchingAnchors = useMemo(
    () => anchors.filter((a) => anchorSupportsAsset(a, assetCode)),
    [anchors, assetCode]
  );

  const chosenAnchor = useMemo(
    () =>
      findAnchorForAsset(
        matchingAnchors,
        assetCode,
        selectedAnchor ?? preferredAnchorName
      ),
    [matchingAnchors, assetCode, selectedAnchor, preferredAnchorName]
  );

  // Poll the session while the interactive step is open so the modal can
  // reflect the anchor's progress and shut down once it is terminal.
  const sessionQuery = useAnchorSession(interactive?.session.id ?? null);
  const liveSession = sessionQuery.data?.session ?? interactive?.session ?? null;
  const liveStatus = liveSession?.status;
  const terminal = liveStatus ? isTerminalAnchorStatus(liveStatus) : false;
  const uiState = liveStatus ? mapAnchorStatusToUiState(liveStatus) : "unknown";

  useEffect(() => {
    if (!interactive) return;
    notifiedRef.current = false;
    setEmbedBlocked(false);
  }, [interactive]);

  useEffect(() => {
    if (!interactive || !liveSession || !liveStatus || !terminal) return;
    if (notifiedRef.current) return;
    notifiedRef.current = true;

    if (liveStatus === "completed") {
      toast.success(
        `${kind === "deposit" ? "Deposit" : "Withdrawal"} completed successfully`
      );
    } else {
      toast.error(`Transfer ended with status: ${liveStatus.replace(/_/g, " ")}`);
    }
    onCompleted?.(liveSession);
  }, [interactive, liveSession, liveStatus, terminal, kind, onCompleted]);

  function reset() {
    setStarting(false);
    setSelectedAnchor(null);
    setInteractive(null);
    setEmbedBlocked(false);
    notifiedRef.current = false;
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleStart() {
    if (!chosenAnchor) return;
    setStarting(true);
    try {
      const payload = { assetCode, anchorName: chosenAnchor.name };

      // 1. API creates the session and fetches a SEP-10 challenge from the anchor.
      const start =
        kind === "deposit"
          ? await api.anchorDeposit(payload)
          : await api.anchorWithdraw(payload);

      // 2. Sign the anchor's challenge in the wallet.
      const signedXdr = await signXdr(
        start.challenge.transaction,
        start.challenge.networkPassphrase
      );

      // 3. Exchange for the SEP-24 interactive URL.
      const { session } = await api.anchorComplete(start.session.id, {
        signedXdr,
      });

      const secureUrl = isSecureAnchorUrl(session.interactiveUrl)
        ? session.interactiveUrl
        : null;

      setInteractive({
        session,
        interactiveUrl: secureUrl,
        mode: "iframe",
        customerFields: [],
      });
      onSessionStarted?.(session);

      toast.success(
        `${kind === "deposit" ? "Deposit" : "Withdrawal"} session started with ${chosenAnchor.name}`,
        { description: "Complete the transfer in the secure anchor window." }
      );

      // A non-HTTPS URL is never embedded or opened automatically — surface
      // the problem instead of silently loading an insecure anchor page.
      if (!secureUrl && session.interactiveUrl) {
        toast.error(
          "The anchor returned an insecure transfer URL. Contact the anchor before continuing."
        );
      }
    } catch (err: unknown) {
      if (err instanceof WalletError) {
        toast.error(
          err.code === "not_installed" ? <NotInstalledMessage /> : err.message
        );
      } else {
        handleApiError(err, "Could not start the SEP-24 anchor flow");
      }
    } finally {
      setStarting(false);
    }
  }

  const directionLabel = kind === "deposit" ? "Deposit" : "Withdraw";
  const interactiveUrl =
    interactive && isSecureAnchorUrl(interactive.interactiveUrl)
      ? interactive.interactiveUrl
      : null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={`${directionLabel} ${assetCode}`}
      description={`SEP-24 ${kind} flow — secure, anchor-hosted transfer`}
      className={interactive ? "max-w-3xl" : undefined}
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

        {/* Auth gate — the API endpoints require a signed-in session. */}
        {!authenticated && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border-2 border-ink bg-butter-pale p-3.5 text-xs font-bold text-ink"
          >
            <Lock className="h-4 w-4 shrink-0" />
            <span>Sign in with your wallet to start a fiat transfer.</span>
          </div>
        )}

        {!interactive && (
          <>
            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-ink bg-cream p-4 text-sm text-ink/60">
                <RefreshCw className="h-4 w-4 animate-spin" />
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
              <Button variant="ghost" onClick={handleClose} disabled={starting}>
                Close
              </Button>
              <Button
                onClick={() => void handleStart()}
                disabled={!authenticated || !chosenAnchor || starting}
                loading={starting}
              >
                {chosenAnchor ? (
                  <Rocket className="h-4 w-4" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                {kind === "deposit" ? "Start Deposit" : "Start Withdrawal"}
              </Button>
            </div>
          </>
        )}

        {/* Interactive step */}
        {interactive && liveSession && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink/10 pb-3">
              <div className="flex items-center gap-2">
                <AssetBadge code={liveSession.assetCode} />
                <p className="font-bold capitalize">
                  {liveSession.kind} · {liveSession.anchorName}
                </p>
              </div>
              <Badge tone={statusTone(liveSession.status)}>
                {liveSession.status.replace(/_/g, " ")}
              </Badge>
            </div>

            <p className="flex items-center gap-2 text-sm text-ink/70">
              <ShieldCheck className="h-4 w-4 shrink-0 text-grape" />
              {getStateDescription(uiState)}
            </p>

            {interactiveUrl && !embedBlocked && !terminal ? (
              <iframe
                title="SEP-24 anchor transfer"
                src={interactiveUrl}
                className="h-[min(60vh,34rem)] w-full rounded-xl border-3 border-ink bg-white"
                sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
                referrerPolicy="no-referrer"
                onError={() => setEmbedBlocked(true)}
              />
            ) : (
              <div
                role="status"
                className="rounded-xl border-2 border-ink bg-butter-pale p-4 text-sm text-ink/80"
              >
                {terminal
                  ? `Transfer ${
                      liveSession.status === "completed"
                        ? "completed successfully"
                        : `ended with status: ${liveSession.status.replace(/_/g, " ")}`
                    }.`
                  : "This anchor cannot be embedded. Continue in a secure external window."}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Button variant="ghost" onClick={handleClose}>
                Close
              </Button>
              {interactiveUrl && !terminal && (
                <a
                  href={interactiveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex"
                >
                  <Button variant="outline">
                    <ExternalLink className="h-4 w-4" /> Open in new tab
                  </Button>
                </a>
              )}
              {embedBlocked && interactive && interactive.session.interactiveUrl && (
                <Button
                  onClick={() => openAnchorPopup(interactive.session.interactiveUrl as string)}
                >
                  <ExternalLink className="h-4 w-4" /> Continue securely
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
