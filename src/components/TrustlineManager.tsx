"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Plus,
  RefreshCw,
  Coins,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { StellarAddressInput } from "@/components/ui/StellarAddressInput";
import { isValidStellarPublicKey } from "@/lib/validators/stellarAddress";
import { AssetBadge } from "@/components/asset-badge";
import { Money } from "@/components/amount";
import { PubkeyChip } from "@/components/tx-link";
import { SETTLEMENT_ASSETS, STABLE_ASSET } from "@/lib/constants";
import { getWalletAssets, addTrustline, WalletError, WalletNotInstalledError } from "@/lib/stellar";
import { useAuth } from "@/hooks/useAuth";
import type { TrustlineAsset } from "@/lib/trustline";

export interface TrustlineManagerProps {
  className?: string;
  onActivated?: (assetCode: string) => void;
}

/**
 * TrustlineManager Component.
 * Manages Stellar trustlines for USDC and custom assets with 1-click Freighter activation.
 */
export function TrustlineManager({ className, onActivated }: TrustlineManagerProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const publicKey = user?.stellarPublicKey ?? "";

  const [customCode, setCustomCode] = useState("");
  const [customIssuer, setCustomIssuer] = useState("");
  const [activatingCode, setActivatingCode] = useState<string | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);

  const {
    data: assets = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<TrustlineAsset[]>({
    queryKey: ["wallet-assets", publicKey],
    queryFn: () => (publicKey ? getWalletAssets(publicKey) : Promise.resolve([])),
    enabled: Boolean(publicKey),
    staleTime: 30_000,
  });

  async function handleEnableTrustline(assetCode: string, issuer: string | null) {
    if (!publicKey) {
      toast.error("Please connect your Stellar wallet first.");
      return;
    }
    if (!issuer) {
      toast.error("Issuer address is required for custom assets.");
      return;
    }

    try {
      setActivatingCode(assetCode);
      const { txHash } = await addTrustline(publicKey, assetCode, issuer);
      toast.success(`Trustline for ${assetCode} activated! (tx ${txHash.slice(0, 8)}…)`);
      
      // Invalidate queries to refresh wallet balances
      await queryClient.invalidateQueries({ queryKey: ["wallet-assets"] });
      await refetch();
      
      if (onActivated) {
        onActivated(assetCode);
      }
      if (assetCode === customCode) {
        setCustomCode("");
        setCustomIssuer("");
        setShowCustomForm(false);
      }
    } catch (err: unknown) {
      if (err instanceof WalletNotInstalledError) {
        toast.error("Freighter wallet extension not found.");
      } else if (err instanceof WalletError) {
        toast.error(err.message);
      } else if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error("Failed to enable trustline.");
      }
    } finally {
      setActivatingCode(null);
    }
  }

  // Ensure default settlement assets are shown even if not returned by Horizon yet
  const displayedAssets: TrustlineAsset[] = SETTLEMENT_ASSETS.map((def) => {
    const found = assets.find((a) => a.code === def.code);
    if (found) return found;
    return {
      code: def.code,
      issuer: def.issuer,
      name: def.code === "XLM" ? "Lumen" : def.code === "USDC" ? "USD Coin" : def.code,
      balance: "0.0000000",
      hasTrustline: def.issuer === null, // Native XLM always has trustline
    };
  });

  return (
    <Card className={`border-3 border-ink bg-paper p-5 shadow-brutal ${className ?? ""}`} data-testid="trustline-manager">
      <CardContent className="p-0 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border-3 border-ink bg-aqua shadow-brutal-sm">
              <ShieldCheck className="h-5 w-5 text-ink" />
            </span>
            <div>
              <h3 className="font-display text-lg uppercase tracking-tight text-ink">
                Trustline Management
              </h3>
              <p className="text-xs text-ink/70">
                Activate assets like USDC to hold, receive, and settle payments on Stellar.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            title="Refresh balances"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Asset Trustlines List */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="py-6 text-center text-sm font-bold text-ink/60" data-testid="trustline-loading">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-ink" />
              Checking wallet trustlines on Stellar...
            </div>
          ) : (
            displayedAssets.map((asset) => {
              const isNative = !asset.issuer;
              const isActivating = activatingCode === asset.code;

              return (
                <div
                  key={asset.code}
                  className={`p-4 rounded-xl border-3 border-ink transition-all ${
                    asset.hasTrustline ? "bg-cream" : "bg-flamingo-pale"
                  }`}
                  data-testid={`trustline-row-${asset.code}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <AssetBadge code={asset.code} />
                        <span className="font-display text-base font-bold uppercase tracking-tight">
                          {asset.name ?? asset.code}
                        </span>
                        {asset.hasTrustline ? (
                          <Badge tone="lime" className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Active Trustline
                          </Badge>
                        ) : (
                          <Badge tone="flamingo" className="flex items-center gap-1">
                            <ShieldAlert className="h-3 w-3" /> Activation Required
                          </Badge>
                        )}
                      </div>

                      {asset.issuer && (
                        <div className="flex items-center gap-1.5 text-xs text-ink/70">
                          <span className="font-bold">Issuer:</span>
                          <PubkeyChip publicKey={asset.issuer} />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] font-mono uppercase text-ink/50 block">Balance</span>
                        <span className="font-mono font-bold text-sm">
                          <Money value={asset.balance} assetCode={asset.code} />
                        </span>
                      </div>

                      {!asset.hasTrustline && asset.issuer && (
                        <Button
                          size="sm"
                          onClick={() => handleEnableTrustline(asset.code, asset.issuer)}
                          disabled={isActivating || !publicKey}
                          data-testid={`enable-trustline-btn-${asset.code}`}
                        >
                          {isActivating ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Enabling...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3.5 w-3.5 mr-1" /> Enable Trustline
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {!asset.hasTrustline && !isNative && (
                    <div className="mt-3 pt-2 border-t border-ink/10 flex items-center gap-1.5 text-xs text-coral font-bold">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>Warning: Without a trustline, payments and settlements in {asset.code} will fail.</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Custom Asset Adder */}
        <div className="pt-2 border-t-2 border-ink/10">
          {!showCustomForm ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCustomForm(true)}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-1" /> Add Custom Token Trustline
            </Button>
          ) : (
            <div className="p-4 rounded-xl border-2 border-ink bg-paper space-y-3">
              <h4 className="font-display text-sm uppercase tracking-tight">Add Custom Token</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="custom-code" className="text-xs">Asset Code</Label>
                  <Input
                    id="custom-code"
                    placeholder="e.g. AQUA"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="custom-issuer" className="text-xs">Issuer Public Key (G...)</Label>
                  <StellarAddressInput
                    id="custom-issuer"
                    placeholder="GBNZ..."
                    value={customIssuer}
                    onChange={setCustomIssuer}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setShowCustomForm(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={
                    !customCode ||
                    !isValidStellarPublicKey(customIssuer) ||
                    activatingCode === customCode
                  }
                  onClick={() => handleEnableTrustline(customCode, customIssuer)}
                >
                  {activatingCode === customCode ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Enabling...
                    </>
                  ) : (
                    "Activate Token"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
export default TrustlineManager;
