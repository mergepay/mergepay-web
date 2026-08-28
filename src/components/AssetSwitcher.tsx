"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, PlusCircle, ShieldAlert, Wallet, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AssetBadge } from "@/components/asset-badge";
import { Money } from "@/components/amount";
import { useAuth } from "@/lib/auth-store";
import { SETTLEMENT_ASSETS, XLM_ASSET } from "@/lib/constants";
import { useAssetStore } from "@/lib/asset-store";
import {
  calculateAssetBalances,
  fetchHorizonAccountBalances,
  TrustlineAsset,
} from "@/lib/trustline";

export interface AssetSwitcherProps {
  /** Optional custom list of configured assets to present in the balancer. */
  assets?: Array<{ code: string; issuer: string | null; name?: string }>;
  /** Optional callback fired whenever active settlement asset is changed. */
  onAssetChange?: (asset: { code: string; issuer: string | null }) => void;
  className?: string;
}

export function AssetSwitcher({
  assets = SETTLEMENT_ASSETS,
  onAssetChange,
  className = "",
}: AssetSwitcherProps) {
  const user = useAuth((s) => s.user);
  const { activeAsset, setActiveAsset } = useAssetStore();
  const [addingTrustline, setAddingTrustline] = useState<string | null>(null);

  // Fetch live Horizon account balances using TanStack React Query
  const { data: horizonBalances = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["horizonBalances", user?.stellarPublicKey],
    queryFn: () => fetchHorizonAccountBalances(user?.stellarPublicKey ?? ""),
    enabled: Boolean(user?.stellarPublicKey),
    staleTime: 15_000,
  });

  const trustlineAssets: TrustlineAsset[] = calculateAssetBalances(
    horizonBalances,
    assets
  );

  const selectedAssetItem =
    trustlineAssets.find(
      (a) => a.code === activeAsset.code && a.issuer === activeAsset.issuer
    ) ??
    trustlineAssets[0] ?? {
      code: XLM_ASSET.code,
      issuer: XLM_ASSET.issuer,
      balance: "0.0000000",
      hasTrustline: true,
    };

  const handleSelectAsset = (asset: TrustlineAsset) => {
    const newActive = { code: asset.code, issuer: asset.issuer };
    setActiveAsset(newActive);
    onAssetChange?.(newActive);
  };

  const handleAddTrustline = async (asset: TrustlineAsset) => {
    setAddingTrustline(asset.code);
    try {
      // Prompt Freighter or open Freighter extension for trustline addition
      if (typeof window !== "undefined" && (window as any).freighter) {
        await (window as any).freighter.changeTrustLine({
          assetCode: asset.code,
          assetIssuer: asset.issuer ?? "",
        });
      } else {
        window.open("https://freighter.app", "_blank");
      }
      await refetch();
    } catch {
      // Ignored or handled gracefully
    } finally {
      setAddingTrustline(null);
    }
  };

  return (
    <Card className={`overflow-hidden border-3 border-ink bg-cream shadow-brutal ${className}`}>
      <CardHeader className="border-b-3 border-ink bg-butter-pale px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border-2 border-ink bg-lime shadow-brutal-sm">
              <Wallet className="h-4 w-4 text-ink" />
            </div>
            <div>
              <CardTitle className="text-base">Trustline Asset Balancer</CardTitle>
              <p className="text-xs text-ink/60 font-mono">Select active settlement asset</p>
            </div>
          </div>
          <Badge tone={selectedAssetItem.hasTrustline ? "lime" : "tangerine"}>
            {selectedAssetItem.hasTrustline ? "Trustline Active" : "Missing Trustline"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        {/* Asset Selection Grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {trustlineAssets.map((asset) => {
            const isSelected =
              activeAsset.code === asset.code && activeAsset.issuer === asset.issuer;

            return (
              <button
                key={`${asset.code}-${asset.issuer ?? "native"}`}
                type="button"
                onClick={() => handleSelectAsset(asset)}
                className={`flex flex-col justify-between rounded-xl border-3 border-ink p-3.5 text-left transition-all duration-100 min-h-[84px] ${
                  isSelected
                    ? "bg-paper shadow-brutal-lg -translate-y-0.5"
                    : "bg-cream hover:bg-paper hover:-translate-y-0.5 shadow-brutal-sm"
                }`}
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <div className="flex items-center gap-2">
                    <AssetBadge code={asset.code} />
                    <span className="font-display text-sm uppercase tracking-tight text-ink">
                      {asset.name ?? asset.code}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-ink bg-lime">
                      <CheckCircle className="h-3.5 w-3.5 text-ink" />
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-baseline justify-between gap-2 w-full">
                  <Money value={asset.balance} assetCode={asset.code} className="text-lg font-bold" />
                  {asset.hasTrustline ? (
                    <span className="font-display text-[10px] uppercase text-lime-dark font-bold bg-lime-pale px-1.5 py-0.5 rounded border border-ink">
                      Active
                    </span>
                  ) : (
                    <span className="font-display text-[10px] uppercase text-tangerine-dark font-bold bg-tangerine-pale px-1.5 py-0.5 rounded border border-ink">
                      No Trustline
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Inline Warning Alert for Missing Trustline */}
        {!selectedAssetItem.hasTrustline && (
          <div
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border-3 border-ink bg-tangerine-pale p-4 shadow-brutal-sm"
            role="alert"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream">
                <ShieldAlert className="h-4 w-4 text-tangerine-dark" />
              </div>
              <div>
                <h4 className="font-display text-xs uppercase tracking-wider text-ink font-bold">
                  Trustline Required for {selectedAssetItem.code}
                </h4>
                <p className="text-xs text-ink/75 mt-0.5">
                  Your wallet hasn't established a trustline for {selectedAssetItem.code}.
                  Add it via Freighter to send, receive, or settle in this asset.
                </p>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              loading={addingTrustline === selectedAssetItem.code}
              onClick={() => handleAddTrustline(selectedAssetItem)}
              className="shrink-0 bg-cream text-xs min-h-[38px]"
            >
              <PlusCircle className="h-3.5 w-3.5 mr-1" />
              Add Trustline
            </Button>
          </div>
        )}

        {/* Loading state indicator */}
        {isLoading && (
          <p className="text-center font-display text-xs uppercase tracking-widest text-ink/40">
            Updating wallet balances…
          </p>
        )}
      </CardContent>
    </Card>
  );
}
