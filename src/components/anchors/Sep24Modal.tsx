"use client";

/**
 * SEP-24 deposit / withdrawal modal (#366).
 *
 * A single self-contained flow for moving between fiat and Stellar assets:
 *
 *  1. **Setup** — pick the direction (deposit / withdrawal), the asset
 *     (XLM / USDC) and one of the anchors that advertise support for it.
 *  2. **Start** — create the anchor session, sign the SEP-10 challenge in the
 *     wallet and exchange it for the interactive URL. Wallet, network and
 *     "no anchor supports this" failures each surface their own message.
 *  3. **Interactive** — embed the anchor-hosted page in a sandboxed iframe
 *     while `useAnchorSession` polls for status changes, with an explicit
 *     "open in a new window" escape hatch that reports popup blocking instead
 *     of failing silently.
 *
 * Follows the neobrutalist primitives in `src/components/ui/` and the
 * challenge-signing sequence already used by the anchors page.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  Loader2,
  Rocket,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/badge";
import { useAnchorInfo, anchorSupportsAsset, findAnchorForAsset } from "@/lib/anchorInfo";
import { useAnchorSession } from "@/lib/queries";
import { api } from "@/lib/api";
import { signXdr, WalletError } from "@/lib/stellar";
import { SETTLEMENT_ASSETS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AnchorSession, AnchorSessionKind } from "@/lib/types";

const DIRECTIONS: { kind: AnchorSessionKind; label: string; hint: string }[] = [
  {
    kind: "deposit",
    label: "Deposit",
    hint: "Fund your balance from a bank or cash-in point.",
  },
  {
    kind: "withdrawal",
    label: "Withdraw",
    hint: "Cash out to fiat through the anchor.",
  },
];

export interface Sep24ModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Called when the user closes the modal. */
  onClose: () => void;
  /** Direction the modal opens on. */
  defaultKind?: AnchorSessionKind;
  /** Asset the modal opens on (must be one of the settlement assets). */
  defaultAssetCode?: string;
  /** Called as soon as the server creates the session, so callers can list it. */
  onSessionStarted?: (session: AnchorSession) => void;
}

/** Terminal SEP-24 statuses: nothing more will happen in this window. */
const TERMINAL_STATUSES = ["completed", "error", "refunded"];

export function Sep24Modal({
  open,
  onClose,
  defaultKind = "deposit",
  defaultAssetCode = SETTLEMENT_ASSETS[0].code,
  onSessionStarted,
}: Sep24ModalProps) {
  const [kind, setKind] = useState<AnchorSessionKind>(defaultKind);
  const [assetCode, setAssetCode] = useState(defaultAssetCode);
  const [selectedAnchor, setSelectedAnchor] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startedSession, setStartedSession] = useState<AnchorSession | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const { anchors, isLoading, isError, refetch } = useAnchorInfo(assetCode);
  const matchingAnchors = useMemo(
    () => anchors.filter((a) => anchorSupportsAsset(a, assetCode)),
    [anchors, assetCode]
  );
  const chosenAnchor = findAnchorForAsset(
    matchingAnchors,
    assetCode,
    selectedAnchor
  );

  // Poll the session while the anchor page is open so status badges and the
  // interactive URL stay current without a manual refresh.
  const polled = useAnchorSession(sessionId);
  const session = polled.data?.session ?? startedSession;
  const interactiveUrl = session?.interactiveUrl ?? null;
  const terminal = session
    ? TERMINAL_STATUSES.includes(session.status)
    : false;

  // Reopening always starts from a clean slate — a session started before
  // would otherwise be resumed without its wallet signature.
  useEffect(() => {
    if (open) return;
    setSessionId(null);
    setStartedSession(null);
    setStarting(false);
    setSelectedAnchor(null);
  }, [open]);

  async function handleStart() {
    if (!chosenAnchor || starting) return;
    setStarting(true);
    try {
      const payload = { assetCode, anchorName: chosenAnchor.name };
      const start =
        kind === "deposit"
          ? await api.anchorDeposit(payload)
          : await api.anchorWithdraw(payload);
      toast.success(
        `${kind === "deposit" ? "Deposit" : "Withdrawal"} session started with ${chosenAnchor.name}`
      );
      onSessionStarted?.(start.session);

      const signedXdr = await signXdr(
        start.challenge.transaction,
        start.challenge.networkPassphrase
      );
      const { session: completed } = await api.anchorComplete(
        start.session.id,
        { signedXdr }
      );
      setStartedSession(completed);
      setSessionId(completed.id);
      if (completed.interactiveUrl) {
        toast.success("Complete the transfer in the secure anchor window");
      }
    } catch (err: unknown) {
      // Wallet errors carry their own copy; anything else is a network or
      // API failure we phrase ourselves.
      if (err instanceof WalletError) toast.error(err.message);
      else if (err instanceof Error && err.message)
        toast.error(err.message);
      else toast.error("Could not start the SEP-24 transfer.");
    } finally {
      setStarting(false);
    }
  }

  function handleOpenWindow() {
    if (!interactiveUrl) return;
    const win = window.open(interactiveUrl, "_blank", "noopener,noreferrer");
    if (!win) {
      toast.error(
        "Your browser blocked the pop-up. Allow pop-ups for this site or keep using the embedded window."
      );
    }
  }

  function reset() {
    setSessionId(null);
    setStartedSession(null);
    setSelectedAnchor(null);
  }

  const direction = DIRECTIONS.find((d) => d.kind === kind) ?? DIRECTIONS[0];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={session ? `Complete ${kind === "deposit" ? "deposit" : "withdrawal"}` : `${direction.label} ${assetCode}`}
      description={
        session
          ? "Finish the transfer on the anchor's secure page."
          : "SEP-24 interactive transfer — hosted entirely by the anchor."
      }
    >
      <div className="space-y-4">
        {/* Direction */}
        <div className="grid grid-cols-2 gap-2">
          {DIRECTIONS.map((option) => (
            <button
              key={option.kind}
              type="button"
              aria-pressed={kind === option.kind}
              onClick={() => setKind(option.kind)}
              className={cn(
                "rounded-xl border-3 border-ink p-3 text-left transition-all duration-100",
                kind === option.kind
                  ? "-translate-y-0.5 bg-paper shadow-brutal-lg"
                  : "bg-cream shadow-brutal-sm hover:bg-paper"
              )}
            >
              <span className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-wider">
                {option.kind === "deposit" ? (
                  <ArrowDownToLine className="h-4 w-4" />
                ) : (
                  <ArrowUpFromLine className="h-4 w-4" />
                )}
                {option.label}
              </span>
              <span className="mt-1 block text-[11px] text-ink/60">
                {option.hint}
              </span>
            </button>
          ))}
        </div>

        {/* Asset */}
        <div className="space-y-2">
          <p className="font-display text-xs uppercase tracking-widest text-ink/60">
            Asset
          </p>
          <div className="flex flex-wrap gap-2">
            {SETTLEMENT_ASSETS.map((asset) => (
              <button
                key={asset.code}
                type="button"
                aria-pressed={assetCode === asset.code}
                onClick={() => {
                  setAssetCode(asset.code);
                  setSelectedAnchor(null);
                }}
                className={cn(
                  "rounded-xl border-3 border-ink px-4 py-2 font-display text-xs font-bold uppercase tracking-wider transition-all duration-100",
                  assetCode === asset.code
                    ? "-translate-y-0.5 bg-grape text-white shadow-brutal-lg"
                    : "bg-cream text-ink shadow-brutal-sm hover:bg-paper"
                )}
              >
                {asset.code}
              </button>
            ))}
          </div>
        </div>

        {/* Setup step: anchors for the chosen asset */}
        {!session && (
          <div className="space-y-3">
            <p className="font-display text-xs uppercase tracking-widest text-ink/60">
              Anchor
            </p>

            {isLoading && (
              <div className="flex items-center gap-2 rounded-xl border-2 border-ink bg-cream p-3 text-sm text-ink/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading anchor options…
              </div>
            )}

            {isError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink bg-flamingo-pale p-3 text-xs font-bold"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Could not load anchor information.
                </span>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            )}

            {!isLoading && !isError && matchingAnchors.length === 0 && (
              <div
                role="alert"
                className="rounded-xl border-2 border-ink bg-butter-pale p-3 text-xs text-ink/75"
              >
                No anchors currently support{" "}
                <span className="font-bold">{assetCode}</span>. Choose the other
                asset or check back later.
              </div>
            )}

            {!isLoading &&
              !isError &&
              matchingAnchors.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {matchingAnchors.map((anchor) => {
                    const active = chosenAnchor?.name === anchor.name;
                    return (
                      <li key={anchor.homeDomain}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSelectedAnchor(anchor.name)}
                          className={cn(
                            "w-full rounded-xl border-3 border-ink p-3 text-left transition-all duration-100",
                            active
                              ? "-translate-y-0.5 bg-paper shadow-brutal-lg"
                              : "bg-cream shadow-brutal-sm hover:bg-paper"
                          )}
                        >
                          <span className="flex items-center justify-between gap-2 font-display text-sm font-bold">
                            {anchor.name}
                            {active && <Badge tone="lime">Selected</Badge>}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[11px] text-ink/50">
                            {anchor.homeDomain}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
        )}

        {/* Interactive step */}
        {session && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-ink bg-paper p-3">
              <span className="flex items-center gap-2 text-sm font-bold capitalize">
                <Wallet className="h-4 w-4" />
                {session.kind} · {session.assetCode}
                <span className="text-ink/50">{session.anchorName}</span>
              </span>
              <Badge tone={statusTone(session.status)}>
                {session.status.replace(/_/g, " ")}
              </Badge>
            </div>

            {interactiveUrl && !terminal ? (
              <iframe
                title="SEP-24 interactive transfer"
                src={interactiveUrl}
                className="h-[min(60vh,34rem)] w-full rounded-xl border-3 border-ink bg-white"
                sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
              />
            ) : terminal ? (
              <p
                role="status"
                className="rounded-xl border-2 border-ink bg-butter-pale p-3 text-sm"
              >
                Transfer {session.status}. You can close this window.
              </p>
            ) : (
              <p
                role="alert"
                className="rounded-xl border-2 border-ink bg-flamingo-pale p-3 text-sm"
              >
                <AlertTriangle className="mr-1 inline h-4 w-4" />
                {session.anchorName} did not return an interactive page. Your
                session was created — try again or check the anchor status from
                the Anchors page.
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={starting}>
            Close
          </Button>
          {session ? (
            <>
              <Button variant="outline" onClick={reset} disabled={starting}>
                Start another
              </Button>
              {interactiveUrl && (
                <Button onClick={handleOpenWindow}>
                  <ExternalLink className="h-4 w-4" /> Open in new window
                </Button>
              )}
            </>
          ) : (
            <Button
              onClick={() => void handleStart()}
              disabled={!chosenAnchor || starting}
              loading={starting}
            >
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              Start {direction.label}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
