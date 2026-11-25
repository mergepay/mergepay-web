"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Loader2,
  PlusCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AssetBadge } from "@/components/asset-badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-store";
import { SETTLEMENT_ASSETS } from "@/lib/constants";
import {
  calculateAssetBalances,
  fetchHorizonAccountBalances,
  type ConfiguredAsset,
} from "@/lib/trustline";
import { addTrustline, WalletError } from "@/lib/stellar";
import type { AssetTrustlineWidgetProps } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * AssetTrustlineWidget
 *
 * Dedicated multi-currency asset balance and trustline verification widget.
 * Inspects connected account balances and trustlines via Stellar Horizon RPC
 * using React Query. Proactively alerts users with neobrutalist warning banners
 * and action prompts if custom asset trustlines (USDC) are missing or balances are low.
 */
export function AssetTrustlineWidget({
  publicKey: propPublicKey,
  requiredAssets = SETTLEMENT_ASSETS,
  minimumBalances = { XLM: "1.0", USDC: "0.0" },
  onTrustlineAdded,
  className,
  compact = false,
}: AssetTrustlineWidgetProps) {
  const authUser = useAuth((s) => s.user);
  const activePublicKey = propPublicKey || authUser?.stellarPublicKey || "";

  const [addingCode, setAddingCode] = useState<string | null>(null);

  // TanStack React Query to fetch account balances asynchronously
  const {
    data: balances = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["asset-trustlines", activePublicKey],
    queryFn: async () => {
      if (!activePublicKey) return [];
      try {
        return await fetchHorizonAccountBalances(activePublicKey);
      } catch (err) {
        toast.error("Failed to inspect account trustlines on Horizon");
        throw err;
      }
    },
    enabled: Boolean(activePublicKey),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });

  // Calculate trustline states across configured assets
  const assetStatuses = calculateAssetBalances(balances, requiredAssets);
  const missingTrustlines = assetStatuses.filter((asset) => !asset.hasTrustline);

  // Check low balances
  const lowBalanceAssets = assetStatuses.filter((asset) => {
    if (!asset.hasTrustline) return false;
    const min = minimumBalances?.[asset.code];
    if (min !== undefined) {
      const balanceNum = parseFloat(asset.balance || "0");
      const minNum = parseFloat(String(min));
      return balanceNum < minNum;
    }
    return false;
  });

  // Action handler to establish missing trustline via Freighter
  async function handleAddTrustline(asset: ConfiguredAsset) {
    if (!activePublicKey) {
      toast.error("No Stellar wallet connected");
      return;
    }
    if (!asset.issuer) {
      toast.error(`Asset ${asset.code} has no designated issuer`);
      return;
    }

    setAddingCode(asset.code);
    try {
      const { txHash } = await addTrustline(activePublicKey, asset.code, asset.issuer);
      toast.success(
        `Trustline for ${asset.code} established! (tx ${txHash.slice(0, 8)}…)`
      );
      await refetch();
      onTrustlineAdded?.(asset.code);
    } catch (err: unknown) {
      const message =
        err instanceof WalletError
          ? err.message
          : err instanceof Error
            ? err.message
            : `Failed to establish trustline for ${asset.code}`;
      toast.error(message);
    } finally {
      setAddingCode(null);
    }
  }

  // Not connected state
  if (!activePublicKey) {
    return (
      <div
        className={cn(
          "rounded-2xl border-3 border-ink bg-paper p-4 sm:p-5 shadow-brutal text-center",
          className
        )}
        data-testid="asset-trustline-widget-disconnected"
      >
        <div className="flex flex-col items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border-3 border-ink bg-butter shadow-brutal-sm">
            <Wallet className="h-5 w-5 text-ink" />
          </span>
          <h4 className="font-display text-sm uppercase tracking-wide text-ink">
            Wallet Disconnected
          </h4>
          <p className="text-xs text-ink/70 max-w-sm">
            Connect your Freighter wallet to view real-time Stellar balances and verify trustline readiness.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border-3 border-ink bg-paper p-4 sm:p-5 shadow-brutal space-y-4",
        className
      )}
      data-testid="asset-trustline-widget"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink/10 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border-2 border-ink bg-butter shadow-brutal-sm">
            <Coins className="h-4 w-4 text-ink" />
          </span>
          <div>
            <h4 className="font-display text-sm font-bold uppercase tracking-tight text-ink">
              Asset Balances & Trustlines
            </h4>
            <p className="font-mono text-[11px] text-ink/60 truncate max-w-[200px] sm:max-w-xs">
              {activePublicKey.slice(0, 6)}…{activePublicKey.slice(-6)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 px-2.5 text-xs bg-cream"
            title="Refresh balances"
            data-testid="refresh-trustlines-btn"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1", isFetching && "animate-spin")} />
            Sync
          </Button>
        </div>
      </div>

      {/* Warning Banner: Missing Trustlines */}
      {missingTrustlines.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border-3 border-ink bg-tangerine-pale p-3.5 sm:p-4 shadow-brutal-sm space-y-2.5"
          data-testid="missing-trustline-warning"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream text-tangerine-dark">
              <ShieldAlert className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <h5 className="font-display text-xs font-bold uppercase tracking-wider text-ink">
                Missing Trustline Detected
              </h5>
              <p className="text-xs text-ink/80 leading-relaxed">
                Your wallet cannot receive{" "}
                <span className="font-bold">
                  {missingTrustlines.map((a) => a.code).join(", ")}
                </span>
                . Settle operations in these assets will fail until trustlines are established.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1 pl-10">
            {missingTrustlines.map((asset) => (
              <Button
                key={`action-add-${asset.code}`}
                size="sm"
                variant="outline"
                disabled={addingCode !== null || !asset.issuer}
                onClick={() => handleAddTrustline(asset)}
                className="bg-cream border-2 text-xs font-bold"
                data-testid={`add-trustline-${asset.code}-btn`}
              >
                {addingCode === asset.code ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <PlusCircle className="h-3.5 w-3.5 mr-1 text-ink" />
                )}
                Establish {asset.code} Trustline
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Warning Banner: Low Balances */}
      {lowBalanceAssets.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border-3 border-ink bg-butter-pale p-3 sm:p-3.5 shadow-brutal-sm"
          data-testid="low-balance-warning"
        >
          <div className="flex items-center gap-2.5 text-xs text-ink/80">
            <AlertTriangle className="h-4 w-4 shrink-0 text-tangerine-dark" />
            <span>
              Low balance detected for{" "}
              <span className="font-bold">
                {lowBalanceAssets.map((a) => a.code).join(", ")}
              </span>
              . Maintain sufficient reserve for network fees and settlement payments.
            </span>
          </div>
        </div>
      )}

      {/* Asset Status List */}
      <div className="space-y-2">
        {assetStatuses.map((asset) => (
          <div
            key={asset.code}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border-2 border-ink bg-cream p-3 shadow-brutal-sm"
            data-testid={`asset-row-${asset.code}`}
          >
            <div className="flex items-center gap-2.5">
              <AssetBadge code={asset.code} />
              <div>
                <span className="font-display text-xs font-bold text-ink">
                  {asset.name ?? asset.code}
                </span>
                <span className="ml-2 font-mono text-xs font-bold text-ink">
                  {asset.balance} {asset.code}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2">
              {asset.hasTrustline ? (
                <Badge tone="lime" className="flex items-center gap-1 text-[10px]" data-testid={`trustline-active-${asset.code}`}>
                  <ShieldCheck className="h-3 w-3" />
                  <span>Trustline Active</span>
                </Badge>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge tone="tangerine" className="flex items-center gap-1 text-[10px]" data-testid={`trustline-missing-${asset.code}`}>
                    <AlertTriangle className="h-3 w-3" />
                    <span>Missing Trustline</span>
                  </Badge>
                  {asset.issuer && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={addingCode !== null}
                      onClick={() => handleAddTrustline(asset)}
                      className="h-6 px-2 text-[10px] bg-paper"
                      data-testid={`quick-add-${asset.code}`}
                    >
                      {addingCode === asset.code ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Add"
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AssetTrustlineWidget;
