"use client";

/**
 * Trustline verification banner (#370 / #378, progress states from #545).
 *
 * Renders only when an account is connected *and* at least one configured
 * settlement asset has no trustline — the states a read-only page can do
 * nothing about (no wallet, no shared account) stay silent, because the
 * global wallet-disconnected prompt already covers them.
 *
 * The call to action drives the full Freighter flow through
 * `useTrustlineSubmission` (build → sign → submit → poll until the trustline
 * is actually visible on-chain) and shows which of those legs the user is
 * waiting on. It used to end at "the button spun and then a toast appeared",
 * which left two things unsaid: what Freighter was waiting for, and whether
 * the network had accepted it yet.
 *
 * Wallet failures keep the stable, user-facing `walletMessage` copy in the
 * toast, and also stay on screen as an inline panel with the recovery that
 * matches the failure — plus the transaction hash in the explorer, once there
 * is one, so a slow confirmation can be checked by hand.
 */

import { useEffect, useRef } from "react";
import {
  ExternalLink,
  RefreshCcw,
  SearchCheck,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TxLink } from "@/components/tx-link";
import { TxPhaseLine, TxProgress } from "@/components/ui/tx-progress";
import { cn } from "@/lib/utils";
import { FREIGHTER_INSTALL_URL, walletMessage } from "@/lib/stellar";
import { useTrustlineRequirements } from "@/hooks/useTrustlineRequirements";
import { useTrustlineSubmission } from "@/hooks/useTrustlineSubmission";
import { SUBMISSION_STEPS, type SubmissionFailure } from "@/lib/walletSubmission";
import { formatMissingAssetList, isAddableTrustline } from "@/lib/trustlineCheck";

/** Which state the progress row is in, for colour and `aria-busy`. */
function phaseState(failure: SubmissionFailure | null, confirmed: boolean) {
  if (failure) return "error" as const;
  if (confirmed) return "done" as const;
  return "busy" as const;
}

export function TrustlineBanner({
  className,
  poll,
}: {
  className?: string;
  /**
   * Confirmation poll cadence. The app leaves this alone; tests tighten it so
   * a slow-network path can be exercised without waiting out the real 45s
   * window — the same override `SettlementModal` exposes as `timeouts`.
   */
  poll?: { timeoutMs?: number; intervalMs?: number };
}) {
  const { status, missing, address, refresh } = useTrustlineRequirements();

  const submission = useTrustlineSubmission({
    publicKey: address,
    poll,
    onConfirmed: ({ code }) => {
      toast.success(`${code} trustline confirmed on-chain.`);
      refresh();
    },
  });

  // Toast a failed attempt once per attempt, not once per render: `failure` is
  // state, so an effect keyed on it alone would re-toast whenever the banner
  // happens to re-render. The ref records what has already been announced.
  const toastedRef = useRef<SubmissionFailure | null>(null);
  useEffect(() => {
    const failure = submission.failure;
    if (!failure || toastedRef.current === failure) return;
    toastedRef.current = failure;
    const code = failure.code;
    toast.error(code && code !== "unconfirmed" ? walletMessage(code) : failure.message);
  }, [submission.failure]);

  if (status !== "missing" || missing.length === 0) return null;

  const addable = missing.filter(isAddableTrustline);
  const { target, phase, failure } = submission;
  const busy = submission.busy;
  const activeCode = target?.code ?? null;

  return (
    <section
      role="alert"
      aria-live="polite"
      className={cn(
        "rounded-2xl border-3 border-ink bg-butter p-4 shadow-brutal",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-3 border-ink bg-tangerine text-ink shadow-brutal-sm">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-sm uppercase tracking-wide">
            {formatMissingAssetList(missing)} trustline required
          </h2>
          <p className="mt-1 text-xs leading-snug text-ink/80">
            Your wallet can&apos;t receive or settle these assets until you
            approve a trustline with the issuer. Add it now — the signature
            request opens in Freighter.
          </p>

          {addable.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {addable.map((asset) => (
                <li key={asset.code}>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy && activeCode === asset.code}
                    disabled={busy}
                    onClick={() =>
                      asset.issuer && submission.submit({ code: asset.code, issuer: asset.issuer })
                    }
                    aria-label={`Add ${asset.code} trustline`}
                  >
                    {!busy && <Sparkles className="h-4 w-4" aria-hidden="true" />}
                    Add {asset.code} trustline
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs font-bold text-ink/60">
              This asset is missing an issuer, so a trustline can&apos;t be
              added from here. Contact the group admin.
            </p>
          )}

          {/* Where the attempt is, leg by leg. */}
          {target && (phase || failure) && (
            <div className="mt-3 space-y-2">
              <TxProgress
                steps={SUBMISSION_STEPS}
                completed={submission.completed}
                errored={Boolean(failure)}
                label={`${target.code} trustline progress`}
                className="max-w-xs"
              />
              <TxPhaseLine
                text={
                  failure
                    ? `${failure.title}: ${failure.message}`
                    : submission.label ?? ""
                }
                state={phaseState(failure, phase === "confirmed")}
              >
                {failure?.txHash && <TxLink hash={failure.txHash} />}
              </TxPhaseLine>

              {failure && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {failure.recovery === "check" && (
                    <Button size="sm" variant="outline" onClick={submission.checkAgain} disabled={busy}>
                      <SearchCheck className="h-4 w-4" aria-hidden="true" /> Check again
                    </Button>
                  )}
                  {failure.recovery === "install" && (
                    <a
                      href={FREIGHTER_INSTALL_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex"
                    >
                      <Button size="sm" variant="outline">
                        <ExternalLink className="h-4 w-4" aria-hidden="true" /> Install Freighter
                      </Button>
                    </a>
                  )}
                  {(failure.recovery === "retry" || failure.recovery === "reconnect") && target && (
                    <Button
                      size="sm"
                      onClick={() =>
                        submission.submit({ code: target.code, issuer: target.issuer })
                      }
                      disabled={busy}
                    >
                      <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                      {failure.recovery === "reconnect" ? "Reconnect wallet" : "Try again"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
