"use client";

/**
 * Treasury Mode balance & multi-asset trustline widget (#344).
 *
 * Shows the connected wallet's XLM and USDC holdings side by side — each asset
 * on its own row with its balance, a fiat equivalent and the cross-asset
 * conversion rate — plus quick actions for multi-asset group liquidity:
 * deposits land through the wallet, and missing trustlines are offered as a
 * one-click prompt driven by Freighter rather than an on-chain dead end.
 *
 * Data comes from React Query (`useWalletAssetBalances`, which wraps
 * `getWalletAssets`) so the header refresh control refetches the shared cache
 * instead of inventing its own fetch. The conversion maths lives in
 * `buildWalletAssetSummaries` (src/lib/treasury.ts) and is pure.
 *
 * The two states that must never look healthy are explicit:
 *  - a wallet that has not connected renders a connect prompt, and
 *  - an asset whose trustline is missing is badged and offered an
 *    "Enable trustline" action through `TrustlineModal` (Freighter), instead
 *    of silently reading as a zero balance.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CircleDollarSign,
  Coins,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/amount";
import { useWalletAssetBalances } from "@/hooks/useWalletAssetBalances";
import { useCurrencyRates } from "@/hooks/useCurrencyRates";
import { useFiatPreference } from "@/lib/fiat-preference";
import { buildWalletAssetSummaries, type WalletAssetSummary } from "@/lib/treasury";
import { useWalletStatus } from "@/hooks/useWalletStatus";
import { WalletPrerequisiteNotice } from "@/components/wallet/wallet-status";
import { TrustlineModal } from "@/components/wallet/TrustlineModal";
import { cn } from "@/lib/utils";

/** Lucide indicator per asset code, with a neutral default. */
function AssetIcon({ assetCode }: { assetCode: string }) {
  const code = assetCode.toUpperCase();
  const Icon = code === "USDC" ? CircleDollarSign : Coins;
  return <Icon className="h-4 w-4" aria-hidden />;
}

export function TreasuryBalanceWidget({ className }: { className?: string }) {
  // The hook returns the WalletStatus fields plus `refresh` (same shape the
  // settle dialog consumes): `canSign`/`address` gate the trustline flow.
  const { refresh: refreshWallet, ...walletStatus } = useWalletStatus();
  const publicKey = walletStatus.address;
  const preferredCurrency = useFiatPreference((s) => s.preferredCurrency);
  const { rates, isLive } = useCurrencyRates(preferredCurrency);

  const {
    assets,
    isLoading,
    isError,
    refetch,
  } = useWalletAssetBalances(publicKey);

  const [refreshing, setRefreshing] = useState(false);
  const [trustlineModalOpen, setTrustlineModalOpen] = useState(false);
  const [trustlineTarget, setTrustlineTarget] = useState<WalletAssetSummary | null>(null);

  const summaries = buildWalletAssetSummaries(assets ?? [], {
    XLM: rates.xlm,
    USDC: rates.usdc,
  });
  const missing = summaries.filter((s) => !s.hasTrustline);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refetch();
      refreshWallet();
      toast.success("Wallet balances refreshed");
    } catch {
      toast.error("Could not refresh wallet balances");
    } finally {
      setRefreshing(false);
    }
  }

  /** Assets that still need a trustline and can be added (need an issuer). */
  const addableMissing = useMemo(
    () =>
      missing.filter(
        (m) => typeof m.assetIssuer === "string" && m.assetIssuer.length > 0
      ),
    [missing]
  );

  function openTrustline(asset: WalletAssetSummary) {
    setTrustlineTarget(asset);
    setTrustlineModalOpen(true);
  }

  return (
    <Card className={cn("overflow-hidden", className)} data-testid="treasury-balance-widget">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-3 border-ink bg-aqua px-4 py-2.5">
        <span className="flex items-center gap-2 font-display text-xs uppercase tracking-widest">
          <Landmark className="h-4 w-4" /> Treasury balances
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleRefresh()}
          loading={refreshing}
          disabled={isLoading}
          aria-label="Refresh wallet balances"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="space-y-4 p-4">
        {/* Wallet prerequisite — signing (and adding a trustline) needs the
            wallet; read-only rows still render while it resolves. */}
        {!walletStatus.canSign && walletStatus.kind !== "checking" && (
          <WalletPrerequisiteNotice status={walletStatus} onRefresh={refreshWallet} />
        )}

        {isLoading && (
          <p className="text-sm text-ink/60" role="status">
            Loading wallet balances…
          </p>
        )}

        {isError && !isLoading && (
          <div
            role="alert"
            className="rounded-xl border-3 border-ink bg-flamingo-pale p-3.5 text-xs"
          >
            <p className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4" /> Could not load balances.
            </p>
            <p className="mt-1 text-ink/70">
              The network may be unavailable — try again in a moment.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => void refetch()}
            >
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && summaries.length === 0 && (
          <p className="text-sm text-ink/50">
            Connect your Freighter wallet to see your XLM and USDC balances here.
          </p>
        )}

        {!isLoading && !isError && summaries.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {summaries.map((asset) => (
              <div
                key={`${asset.assetCode}:${asset.assetIssuer ?? "native"}`}
                className="rounded-xl border-3 border-ink bg-paper p-3.5 shadow-brutal-sm"
                data-testid={`treasury-asset-${asset.assetCode}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-display text-xs uppercase tracking-widest">
                    <AssetIcon assetCode={asset.assetCode} />
                    {asset.assetCode}
                  </span>
                  {asset.hasTrustline ? (
                    <Badge tone="lime" className="shadow-none">
                      <ShieldCheck className="h-3 w-3" /> Trusted
                    </Badge>
                  ) : (
                    <Badge tone="butter">
                      <AlertTriangle className="h-3 w-3" /> No trustline
                    </Badge>
                  )}
                </div>

                <div className="mt-2">
                  <Money
                    value={asset.balance}
                    assetCode={asset.assetCode}
                    className="text-xl"
                  />
                </div>

                {/* Conversion rates: direct fiat price and the cross rate into
                    the other settlement asset. Both disappear when the fiat
                    feed has no honest answer. */}
                <div className="mt-2 space-y-1 text-[11px] font-mono text-ink/60">
                  {asset.fiatRate !== null && (
                    <p>
                      1 {asset.assetCode} ≈{" "}
                      {asset.fiatRate.toLocaleString("en-US", {
                        style: "currency",
                        currency: preferredCurrency,
                        maximumFractionDigits: 4,
                      })}{" "}
                      {isLive ? "" : "(indicative)"}
                    </p>
                  )}
                  {asset.crossRate !== null && asset.otherAssetCode && (
                    <p className="flex items-center gap-1">
                      <ArrowRightLeft className="h-3 w-3" aria-hidden />
                      1 {asset.assetCode} ≈ {asset.crossRate.toFixed(4)}{" "}
                      {asset.otherAssetCode}
                    </p>
                  )}
                </div>

                {!asset.hasTrustline && (
                  <Button
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => openTrustline(asset)}
                    disabled={!walletStatus.canSign}
                    data-testid={`trustline-cta-${asset.assetCode}`}
                  >
                    <Wallet className="h-3.5 w-3.5" /> Enable {asset.assetCode}{" "}
                    trustline
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {missing.length > 0 && summaries.length > 0 && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg border-2 border-dashed border-ink/40 bg-paper p-2.5 text-xs text-ink/70"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {missing.map((m) => m.assetCode).join(", ")}{" "}
            {missing.length === 1 ? "needs" : "need"} a trustline before this
            account can receive {missing.length === 1 ? "it" : "them"} — deposits
            will fail on-chain until then.
          </p>
        )}
      </div>

      {/* Missing-trustline prompt — TrustlineModal drives the Freighter
          changeTrust flow and re-checks the account on-chain. */}
      {publicKey && (
        <TrustlineModal
          open={trustlineModalOpen}
          onClose={() => setTrustlineModalOpen(false)}
          publicKey={publicKey}
          assets={
            trustlineTarget
              ? [
                  {
                    code: trustlineTarget.assetCode,
                    issuer: trustlineTarget.assetIssuer,
                    name: trustlineTarget.assetCode,
                  },
                ]
              : addableMissing.map((m) => ({
                  code: m.assetCode,
                  issuer: m.assetIssuer as string,
                  name: m.assetCode,
                }))
          }
          onAllReady={() => {
            void refetch();
            setTrustlineModalOpen(false);
          }}
        />
      )}
    </Card>
  );
}


