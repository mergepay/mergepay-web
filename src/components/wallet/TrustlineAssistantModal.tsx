"use client";

/**
 * TrustlineAssistantModal
 * 
 * Onboarding assistant modal that detects missing trustlines for group settlement
 * assets and guides the user step-by-step through signing the trustline transaction
 * using Freighter, with progress indicators, React Query cache invalidation, and
 * clear error handling on rejection.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { addTrustline, WalletError } from "@/lib/stellar";
import { useTrustlines, type TrustlineAssetRequirement } from "../../hooks/useTrustlines";

export interface TrustlineAssistantModalProps {
  open: boolean;
  onClose: () => void;
  publicKey: string;
  assets: TrustlineAssetRequirement[];
  onAllReady?: () => void;
}

export function TrustlineAssistantModal({
  open,
  onClose,
  publicKey,
  assets,
  onAllReady,
}: TrustlineAssistantModalProps) {
  const queryClient = useQueryClient();
  const { results, missingAssets, hasMissing, refetch } = useTrustlines(publicKey, assets);

  const [processingCode, setProcessingCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const totalAssets = assets.length;
  const readyCount = totalAssets - missingAssets.length;
  const progressPercent = totalAssets > 0 ? Math.round((readyCount / totalAssets) * 100) : 100;

  async function handleEnableTrustline(asset: TrustlineAssetRequirement) {
    if (!asset.issuer) return;
    setProcessingCode(asset.code);
    setActionError(null);

    try {
      const { txHash } = await addTrustline(publicKey, asset.code, asset.issuer);
      toast.success(`${asset.code} trustline added (tx ${txHash.slice(0, 8)}...)`);
      
      // Invalidate query cache to trigger reactive updates
      await queryClient.invalidateQueries({ queryKey: ["trustlines-batch"] });
      await queryClient.invalidateQueries({ queryKey: ["trustline"] });
      await refetch();

      const updated = results.find((r) => r.asset.code === asset.code);
      if (updated && missingAssets.length <= 1) {
        if (onAllReady) onAllReady();
      }
    } catch (err: unknown) {
      const message =
        err instanceof WalletError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Transaction rejected or failed in Freighter.";
      setActionError(message);
      toast.error(message);
    } finally {
      setProcessingCode(null);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Trustline Setup Assistant"
      description="Configure required asset trustlines in your Stellar wallet to settle group expenses."
    >
      <div className="space-y-5 pt-2">
        {/* Progress header */}
        <div className="rounded-2xl border-3 border-ink bg-paper p-4 shadow-brutal-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="font-display text-xs uppercase tracking-wider text-ink/70">
              Setup Progress
            </span>
            <span className="font-mono font-bold text-sm">
              {readyCount} / {totalAssets} Ready
            </span>
          </div>
          <ProgressBar value={progressPercent} aria-label="Trustline setup progress" />
        </div>

        {/* Error notification if user rejected or tx failed */}
        {actionError && (
          <div className="flex items-start gap-2 rounded-xl border-2 border-ink bg-flamingo-pale p-3 text-xs text-ink font-bold" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0 text-flamingo mt-0.5" />
            <div className="space-y-1">
              <p>Wallet action failed</p>
              <p className="text-ink/70 font-normal">{actionError}</p>
            </div>
          </div>
        )}

        {/* Asset list */}
        <div className="space-y-3">
          {results.map(({ asset, hasTrustline }) => {
            const isProcessing = processingCode === asset.code;
            return (
              <div
                key={asset.code}
                className="flex items-center justify-between rounded-xl border-3 border-ink bg-cream p-3.5 shadow-hard-sm"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-ink ${
                      hasTrustline ? "bg-mint" : "bg-tangerine"
                    }`}
                  >
                    {hasTrustline ? (
                      <ShieldCheck className="h-5 w-5 text-ink" />
                    ) : (
                      <Wallet className="h-5 w-5 text-ink" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-bold text-sm">{asset.code}</span>
                      {asset.name && (
                        <span className="text-xs text-ink/60">({asset.name})</span>
                      )}
                    </div>
                    <p className="text-[11px] text-ink/70">
                      {hasTrustline
                        ? "Trustline is active and ready"
                        : "Missing trustline required for settlements"}
                    </p>
                  </div>
                </div>

                <div>
                  {hasTrustline ? (
                    <Badge tone="mint" className="gap-1 px-3 py-1 font-bold">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Active
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void handleEnableTrustline(asset)}
                      loading={isProcessing}
                    >
                      Enable
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {!hasMissing && (
            <Button onClick={() => { if (onAllReady) onAllReady(); onClose(); }}>
              Continue
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
