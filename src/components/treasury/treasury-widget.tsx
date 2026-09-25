"use client";

/**
 * Collective treasury widget (#392).
 *
 * Aggregates balances across every treasury-enable group the user belongs to,
 * summed per asset code (XLM and USDC are never totaled together — each gets
 * its own row), and displays the collective treasury status in a single
 * neobrutalist card. Handles the zero-balance / missing-trustline edge cases
 * gracefully: empty treasuries render a friendly idle state instead of a
 * misleading `0` headline.
 */

import { Landmark, Loader2, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/amount";
import { useTreasuryAggregate } from "@/lib/queries";
import type { GroupSummary } from "@/lib/types";

/** A share of a group the calling page already has loaded, for row count. */
export interface TreasuryGroupFlag {
  id: string;
  name: string;
  treasuryEnabled: boolean;
}

export function TreasuryWidget({
  groups,
  className,
}: {
  groups: readonly TreasuryGroupFlag[];
  className?: string;
}) {
  // Stable array for the hook — keys on id only so treasury toggles re-fetch.
  const enabled = groups.filter((g) => g.treasuryEnabled);
  const query = useTreasuryAggregate(
    enabled.map((g) => ({ id: g.id, name: g.name, treasuryEnabled: g.treasuryEnabled }))
  );

  // No treasury groups at all — nothing to aggregate; render nothing.
  if (enabled.length === 0) {
    return null;
  }

  const aggregate = query.data;
  const isLoading = query.isLoading;
  const isError = query.isError;

  return (
    <Card className={className ? `overflow-hidden ${className}` : "overflow-hidden"}>
      <div className="flex items-center justify-between border-b-3 border-ink bg-aqua px-4 py-2.5">
        <span className="flex items-center gap-2 font-display text-xs uppercase tracking-widest">
          <Landmark className="h-4 w-4" /> Shared treasury
        </span>
        <Badge tone="ink">{aggregate?.treasuryCount ?? enabled.length} group{enabled.length === 1 ? "" : "s"}</Badge>
      </div>

      <div className="space-y-3 p-4">
        {isLoading && !aggregate ? (
          <div className="flex items-center gap-2 text-sm text-ink/60">
            <Loader2 className="h-4 w-4 animate-spin" /> Aggregating
            balances…
          </div>
        ) : isError && !aggregate ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-ink bg-flamingo-pale px-3 py-2 text-sm">
            <span>Couldn&apos;t load treasury balances.</span>
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              <RefreshCcw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        ) : aggregate && aggregate.assets.length > 0 ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {aggregate.assets.map((asset) => (
                <div
                  key={`${asset.assetCode}:${asset.assetIssuer ?? ""}`}
                  className="flex items-center justify-between rounded-xl border-2 border-ink bg-paper px-4 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-ink bg-cream font-display text-[10px] font-bold uppercase">
                      {asset.assetCode.slice(0, 2)}
                    </span>
                    <span className="font-display text-xs uppercase tracking-widest">
                      {asset.assetCode}
                    </span>
                    {asset.assetCode === "XLM" && (
                      <Badge tone="aqua" className="shadow-none">native</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Money value={asset.total} assetCode={asset.assetCode} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-ink/50">
              Combined across {aggregate.treasuryCount} enabled group{
                aggregate.treasuryCount === 1 ? "" : "s"
              }.
            </p>
          </>
        ) : (
          <p className="text-sm text-ink/50">
            No balances across your treasuries yet — fund one to see it here.
          </p>
        )}
      </div>
    </Card>
  );
}

export type { GroupSummary };