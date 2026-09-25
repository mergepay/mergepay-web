"use client";

/**
 * TrustlineVerificationBanner
 *
 * Multi-currency trustline verification banner rendered on payment screens.
 * Queries the connected account's Horizon balances once, computes which of the
 * required settlement assets are missing a trustline, and — when any are
 * missing — shows a neobrutalist alert banner with a quick-action button that
 * establishes the missing trustlines through Freighter.
 *
 * XLM is native and always has a trustline, so it never triggers the banner.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, PlusCircle, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AssetBadge } from "@/components/asset-badge";
import {
  fetchHorizonAccountBalances,
  missingTrustlines,
  type ConfiguredAsset,
} from "@/lib/trustline";
import { addTrustline, WalletError } from "@/lib/stellar";

export interface TrustlineVerificationBannerProps {
  /** Connected wallet's Stellar public key. */
  publicKey: string;
  /** Required settlement assets to verify. */
  assets: ConfiguredAsset[];
  /** Optional callback fired when all required trustlines are present. */
  onReady?: () => void;
}

export function TrustlineVerificationBanner({
  publicKey,
  assets,
  onReady,
}: TrustlineVerificationBannerProps) {
  const [addingCode, setAddingCode] = useState<string | null>(null);

  const { data: balances = [], isLoading, refetch } = useQuery({
    queryKey: ["trustline-banner", publicKey],
    queryFn: () => fetchHorizonAccountBalances(publicKey),
    enabled: Boolean(publicKey),
    staleTime: 15_000,
  });

  const missing = missingTrustlines(balances, assets);

  if (missing.length === 0) {
    // Keep the onReady contract fire-once per resolution.
    return null;
  }

  async function handleAddTrustline(asset: ConfiguredAsset) {
    if (!asset.issuer) return;
    setAddingCode(asset.code);
    try {
      const { txHash } = await addTrustline(publicKey, asset.code, asset.issuer);
      toast.success(`Trustline for ${asset.code} established (tx ${txHash.slice(0, 8)}…)`);
      const refreshed = await refetch();
      const stillMissing = missingTrustlines(refreshed.data ?? [], assets);
      if (stillMissing.length === 0) {
        onReady?.();
      }
    } catch (err: unknown) {
      const message =
        err instanceof WalletError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to add trustline in wallet";
      toast.error(message);
    } finally {
      setAddingCode(null);
    }
  }

  return (
    <div
      role="alert"
      className="rounded-xl border-3 border-ink bg-tangerine-pale p-4 shadow-brutal-sm"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream">
          <AlertTriangle className="h-4 w-4 text-tangerine-dark" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h4 className="font-display text-xs font-bold uppercase tracking-wider text-ink">
              Trustline Required
            </h4>
            <p className="mt-0.5 text-xs text-ink/75">
              Your wallet needs a trustline for{" "}
              {missing.map((a) => a.code).join(", ")} before this payment can
              settle.
            </p>
          </div>

          <ul className="flex flex-wrap gap-2">
            {missing.map((asset) => (
              <li key={asset.code} className="flex items-center gap-2">
                <AssetBadge code={asset.code} />
                <Button
                  size="sm"
                  variant="outline"
                  loading={addingCode === asset.code}
                  disabled={addingCode !== null}
                  onClick={() => handleAddTrustline(asset)}
                  className="bg-cream"
                >
                  {addingCode === asset.code ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlusCircle className="h-3.5 w-3.5" />
                  )}
                  Add
                </Button>
              </li>
            ))}
          </ul>

          {isLoading && (
            <p className="flex items-center gap-1.5 text-xs text-ink/50">
              <Loader2 className="h-3 w-3 animate-spin" /> Checking balances…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Icon helpers re-exported for callers that render per-asset status rows. */
export const TrustlineStatusIcons = {
  ok: ShieldCheck,
  missing: AlertTriangle,
  added: CheckCircle2,
  wallet: Wallet,
};
