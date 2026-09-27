"use client";

/**
 * Treasury Mode view (#376).
 *
 * A comprehensive, group-scoped view of the shared treasury: what the group
 * actually holds, how that value splits across assets, whether each supported
 * asset is *trusted* by the treasury account, and which members funded it.
 *
 * Why it exists: a group rarely holds only XLM — it can save in USDC too. The
 * ledger's per-asset balances are meaningless when summed together, so this
 * view keeps each asset on its own row (`buildTreasuryDistribution`) and uses
 * `Money` from the shared amount layer so 7-decimal Stellar amounts render with
 * consistent precision instead of a `parseFloat`-mangled string.
 *
 * The two failure states that must never look healthy are explicit:
 *  - an empty / all-zero treasury renders an idle banner, and
 *  - an asset whose trustline has never been established is badged "missing"
 *    rather than silently omitted.
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Money, NetAmount } from "@/components/amount";
import { FiatEquivalent } from "@/components/FiatEquivalent";
import { AssetBadge } from "@/components/asset-badge";
import { Avatar } from "@/components/ui/avatar";
import { PubkeyChip } from "@/components/tx-link";
import { Skeleton } from "@/components/ui/skeleton";
import { useTreasuryHistory, useTreasuryInfo } from "@/lib/queries";
import {
  aggregateMemberContributions,
  buildTreasuryDistribution,
  splitTrustlineState,
} from "@/lib/treasury";
import { useCurrencyRates, convertToFiat } from "@/hooks/useCurrencyRates";
import { useFiatPreference } from "@/lib/fiat-preference";
import { SETTLEMENT_ASSETS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Lucide indicator per asset code, with a neutral default. */
function AssetIcon({ assetCode }: { assetCode: string }) {
  const code = assetCode.toUpperCase();
  const Icon = code === "USDC" ? CircleDollarSign : Coins;
  return <Icon className="h-4 w-4" aria-hidden />;
}

/** Human-list helper: `"XLM"`, `"XLM and USDC"`, `"XLM, USDC and EURT"`. */
function joinCodes(codes: string[]): string {
  if (codes.length <= 1) return codes[0] ?? "";
  if (codes.length === 2) return `${codes[0]} and ${codes[1]}`;
  return `${codes.slice(0, -1).join(", ")} and ${codes[codes.length - 1]}`;
}

export function TreasuryView({
  groupId,
  treasuryEnabled = true,
  requiredSigners = null,
  treasuryAccountPublicKey = null,
  className,
}: {
  /** Group whose shared treasury is being shown. */
  groupId: string;
  /** `false` renders the "not enabled" state instead of fetching. */
  treasuryEnabled?: boolean;
  /** Expected withdrawal threshold, used for the multisig badge. */
  requiredSigners?: number | null;
  /** On-chain treasury account, shown so members can verify deposits. */
  treasuryAccountPublicKey?: string | null;
  className?: string;
}) {
  const enabled = treasuryEnabled && Boolean(groupId);
  const info = useTreasuryInfo(groupId, enabled);
  const history = useTreasuryHistory(groupId, enabled);
  const preferredCurrency = useFiatPreference((s) => s.preferredCurrency);
  const { rates, isLive } = useCurrencyRates(preferredCurrency);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([info.refetch(), history.refetch()]);
      toast.success("Treasury refreshed");
    } catch {
      toast.error("Could not refresh the treasury");
    } finally {
      setRefreshing(false);
    }
  }

  // Not enabled is a deliberate product state, not an error.
  if (!enabled) {
    return (
      <Card className={cn("p-5", className)} data-testid="treasury-view">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-butter">
            <Landmark className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-display text-base uppercase tracking-tight">
              Treasury mode is off
            </h3>
            <p className="mt-1 text-sm text-ink/60">
              A group admin can enable a shared treasury to pool funds for
              recurring expenses.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const balances = info.data?.balances ?? [];
  const expectedAssets = SETTLEMENT_ASSETS.map((a) => a.code);
  const distribution = buildTreasuryDistribution(
    balances,
    (amount, code) => {
      const fiat = convertToFiat(amount, code, rates);
      return fiat === null ? 0 : parseFloat(fiat);
    },
    expectedAssets
  );
  const trustlines = splitTrustlineState(expectedAssets, balances);
  const contributions = aggregateMemberContributions(
    history.data?.transactions ?? []
  );

  const loading = info.isLoading && !info.data;

  return (
    <Card className={cn("overflow-hidden", className)} data-testid="treasury-view">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-3 border-ink bg-butter px-4 py-2.5">
        <span className="flex items-center gap-2 font-display text-xs uppercase tracking-widest">
          <Landmark className="h-4 w-4" /> Treasury mode
        </span>
        <div className="flex items-center gap-2">
          {requiredSigners && requiredSigners > 1 && (
            <Badge tone="ink">
              <ShieldCheck className="h-3 w-3" /> {requiredSigners}-signer
              approval
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleRefresh()}
            loading={refreshing}
            disabled={loading}
            aria-label="Refresh treasury balances"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      <div className="space-y-5 p-4">
        {treasuryAccountPublicKey && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[10px] uppercase tracking-widest text-ink/50">
              Account
            </span>
            <PubkeyChip publicKey={treasuryAccountPublicKey} />
          </div>
        )}

        {loading && (
          <div className="space-y-3" role="status">
            <span className="sr-only">Loading treasury balances…</span>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {info.isError && !loading && (
          <div
            role="alert"
            className="rounded-xl border-3 border-ink bg-flamingo-pale p-3.5 text-xs"
          >
            <p className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4" /> Could not load the treasury.
            </p>
            <p className="mt-1 text-ink/70">
              The balances for this group are unavailable right now.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => void info.refetch()}
            >
              Retry
            </Button>
          </div>
        )}

        {!loading && !info.isError && (
          <>
            {/* Trustline readiness — the clearest signal of what the treasury
                can and cannot hold. */}
            <div className="rounded-xl border-2 border-ink bg-cream p-3">
              <p className="flex items-center gap-2 font-display text-[10px] uppercase tracking-widest text-ink/50">
                <ShieldCheck className="h-3.5 w-3.5" /> Trustline requirements
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SETTLEMENT_ASSETS.map((asset) => {
                  const ready = trustlines.funded.includes(asset.code);
                  return (
                    <Badge key={asset.code} tone={ready ? "lime" : "butter"}>
                      {ready ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {asset.code} {ready ? "ready" : "missing"}
                    </Badge>
                  );
                })}
              </div>
            </div>

            {distribution.allZero ? (
              <div className="space-y-3">
                <div className="rounded-xl border-3 border-ink bg-cream p-4 text-sm">
                  <p className="font-bold">No balances in the treasury yet</p>
                  <p className="mt-1 text-xs text-ink/70">
                    Deposit to the shared treasury to start tracking holdings
                    here.
                  </p>
                </div>
                {trustlines.missing.length > 0 && (
                  <div
                    role="status"
                    className="rounded-xl border-2 border-dashed border-ink/50 bg-paper p-3 text-xs text-ink/70"
                  >
                    <p className="flex items-center gap-2 font-bold text-ink">
                      <AlertTriangle className="h-3.5 w-3.5" /> Trustlines not
                      established
                    </p>
                    <p className="mt-1">
                      {joinCodes(trustlines.missing)} must be trusted before
                      {trustlines.missing.length === 1 ? " that asset" : " those assets"}{" "}
                      can be held.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="font-display text-[10px] uppercase tracking-widest text-ink/50">
                  {distribution.basis === "value"
                    ? `Asset breakdown · by ${preferredCurrency} value${
                        isLive ? "" : " (indicative rate)"
                      }`
                    : "Asset breakdown · relative to largest holding"}
                </p>

                <ul className="space-y-4">
                  {distribution.assets.map((asset) => (
                    <li
                      key={`${asset.assetCode}:${asset.assetIssuer ?? ""}`}
                      className="space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-bold">
                          <AssetIcon assetCode={asset.assetCode} />
                          {asset.assetCode}
                          {!asset.established && (
                            <Badge tone="butter">No trustline</Badge>
                          )}
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <Money
                            value={asset.balance}
                            assetCode={asset.assetCode}
                          />
                          <FiatEquivalent
                            amount={asset.amount}
                            assetCode={asset.assetCode}
                          />
                          <span className="font-mono text-xs text-ink/60">
                            {asset.percent}%
                          </span>
                        </span>
                      </div>
                      <div
                        className="h-3 w-full overflow-hidden rounded-md border-2 border-ink bg-cream"
                        role="progressbar"
                        aria-label={`${asset.assetCode} share of treasury`}
                        aria-valuenow={asset.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className={cn(
                            "h-full bg-grape transition-[width] duration-500",
                            !asset.established && "bg-butter"
                          )}
                          style={{ width: `${Math.min(100, asset.percent)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>

                {trustlines.missing.length > 0 && (
                  <p
                    role="status"
                    className="flex items-center gap-2 rounded-lg border-2 border-dashed border-ink/40 bg-paper p-2.5 text-xs text-ink/70"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {joinCodes(trustlines.missing)}{" "}
                    {trustlines.missing.length === 1 ? "is" : "are"} not held by
                    this treasury yet.
                  </p>
                )}
              </div>
            )}

            {/* Who funded the pot — net movement per member, per asset. */}
            <div className="space-y-2">
              <p className="flex items-center gap-2 font-display text-[10px] uppercase tracking-widest text-ink/50">
                <Users className="h-3.5 w-3.5" /> Member contributions
              </p>
              {history.isLoading && !history.data ? (
                <Skeleton className="h-16 w-full" />
              ) : contributions.length === 0 ? (
                <p className="text-xs text-ink/50">
                  No confirmed treasury activity from members yet.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {contributions.map((member) => (
                    <li
                      key={member.userId}
                      className="rounded-xl border-2 border-ink bg-paper px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <Avatar
                            size="sm"
                            user={{
                              displayName: member.userName,
                              stellarPublicKey: member.stellarPublicKey,
                              avatarUrl: member.avatarUrl,
                            }}
                          />
                          <span className="truncate text-sm font-bold">
                            {member.userName}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-ink/50">
                          {member.transactionCount} tx
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1.5">
                        {member.assets.map((asset) => (
                          <li
                            key={`${asset.assetCode}:${asset.assetIssuer ?? ""}`}
                            className="flex flex-wrap items-center justify-between gap-2 text-xs"
                          >
                            <span className="flex items-center gap-2">
                              <AssetBadge code={asset.assetCode} />
                              <span className="text-ink/50">
                                in {asset.deposited} · out {asset.withdrawn}
                              </span>
                            </span>
                            <NetAmount
                              value={asset.net}
                              assetCode={asset.assetCode}
                              className="text-xs"
                            />
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
