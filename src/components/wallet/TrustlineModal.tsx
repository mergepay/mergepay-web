"use client";

/**
 * TrustlineModal
 *
 * Automated trustline check and guided modal component built in src/components/wallet/
 * to verify user account balances and trustlines for supported Stellar assets, and invoke
 * Freighter to build and submit change trust transactions when missing.
 */

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { addTrustline, WalletError } from "@/lib/stellar";
import { useTrustlines, type TrustlineAssetRequirement } from "../../hooks/useTrustlines";

export type { TrustlineAssetRequirement };

export interface TrustlineModalProps {
  open: boolean;
  onClose: () => void;
  publicKey: string;
  assets: TrustlineAssetRequirement[];
  onAllReady?: () => void;
}

export function TrustlineModal({
  open,
  onClose,
  publicKey,
  assets,
  onAllReady,
}: TrustlineModalProps) {
  const queryClient = useQueryClient();
  const { results, missingAssets, refetch } = useTrustlines(publicKey, assets);

  const [processingCode, setProcessingCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const totalAssets = assets.length;
  const readyCount = totalAssets - missingAssets.length;
  const progressPercent = totalAssets > 0 ? Math.round((readyCount / totalAssets) * 100) : 100;

  const handleEnableTrustline = useCallback(async (asset: TrustlineAssetRequirement) => {
    if (!asset.issuer) return;
    setProcessingCode(asset.code);
    setActionError(null);

    try {
      const { txHash } = await addTrustline(publicKey, asset.code, asset.issuer);
      toast.success(`${asset.code} trustline added (tx ${txHash.slice(0, 8)}...)`);
      
      await queryClient.invalidateQueries({ queryKey: ["trustlines-batch"] });
      await queryClient.invalidateQueries({ queryKey: ["trustline"] });
      await refetch();

      if (missingAssets.length <= 1) {
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
  }, [publicKey, queryClient, refetch, missingAssets.length, onAllReady]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Trustline Verification & Setup"
      description="Ensure required asset trustlines are established in your Stellar wallet."
    >
      <div className="space-y-5 pt-2">
        <div className="rounded-2xl border-3 border-ink bg-paper p-4 shadow-brutal-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="font-display text-xs uppercase tracking-wider text-ink/70">
              Setup Progress
            </span>
            <span className="font-mono font-bold text-sm">
              {readyCount} / {totalAssets} Ready
            </span>
          </div>
          <ProgressBar value={progressPercent} aria-label="Trustline verification progress" />
        </div>

        {actionError && (
          <div className="flex items-start gap-2 rounded-xl border-2 border-ink bg-flamingo-pale p-3 text-xs text-ink font-bold" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0 text-flamingo mt-0.5" />
            <div className="space-y-1">
              <p>Wallet action failed</p>
              <p className="text-ink/70 font-normal">{actionError}</p>
            </div>
          </div>
        )}

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
                    <p className="font-display text-sm font-bold tracking-wide">{asset.code}</p>
                    <p className="text-xs text-ink/70">
                      {hasTrustline ? "Active trustline present" : "Missing trustline required"}
                    </p>
                  </div>
                </div>

                <div>
                  {hasTrustline ? (
                    <div className="flex items-center gap-1.5 rounded-lg border-2 border-ink bg-mint-pale px-3 py-1.5 text-xs font-bold text-ink">
                      <CheckCircle2 className="h-4 w-4 text-ink" />
                      <span>Ready</span>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      loading={isProcessing}
                      disabled={isProcessing}
                      onClick={() => handleEnableTrustline(asset)}
                      className="bg-tangerine text-ink hover:bg-tangerine/90 border-2 border-ink"
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wallet className="h-4 w-4 mr-1.5" />
                      )}
                      Add Trustline
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
