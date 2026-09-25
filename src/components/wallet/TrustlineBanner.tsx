"use client";

/**
 * Trustline verification banner (#370 / #378).
 *
 * Renders only when an account is connected *and* at least one configured
 * settlement asset has no trustline — the states a read-only page can do
 * nothing about (no wallet, no shared account) stay silent, because the
 * global wallet-disconnected prompt already covers them.
 *
 * The call to action drives the full Freighter flow through
 * `addTrustline` (build → sign in Freighter → submit), then re-runs the
 * check. Wallet failures are surfaced with the stable, user-facing
 * `walletMessage` copy rather than raw provider strings.
 */

import { useState } from "react";
import { ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WalletError, addTrustline, walletMessage } from "@/lib/stellar";
import { useTrustlineCheck } from "@/hooks/useTrustlineCheck";
import { formatMissingAssetList, isAddableTrustline } from "@/lib/trustlineCheck";

export function TrustlineBanner({ className }: { className?: string }) {
  const { status, missing, address, refresh } = useTrustlineCheck();
  const [pending, setPending] = useState<string | null>(null);

  if (status !== "missing" || missing.length === 0) return null;

  const addable = missing.filter(isAddableTrustline);

  async function handleAdd(code: string, issuer: string) {
    if (!address || pending) return;
    setPending(code);
    try {
      await addTrustline(address, code, issuer);
      toast.success(`${code} trustline confirmed on-chain.`);
      refresh();
    } catch (e) {
      toast.error(
        e instanceof WalletError
          ? walletMessage(e.code)
          : "Could not add the trustline. Please try again."
      );
    } finally {
      setPending(null);
    }
  }

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
              {addable.map((asset) => {
                const issuer = asset.issuer;
                if (!issuer) return null;
                return (
                  <li key={asset.code}>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={pending === asset.code}
                      onClick={() => void handleAdd(asset.code, issuer)}
                      aria-label={`Add ${asset.code} trustline`}
                    >
                      {pending !== asset.code && (
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                      )}
                      Add {asset.code} trustline
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-xs font-bold text-ink/60">
              This asset is missing an issuer, so a trustline can&apos;t be
              added from here. Contact the group admin.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
