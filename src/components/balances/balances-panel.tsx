"use client";

import { useState } from "react";
import { ArrowRight, HandCoins, PartyPopper } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { NetAmount, Money } from "@/components/amount";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import {
  SettleDialog,
  suggestionToTarget,
  type SettleTarget,
} from "@/components/settle/settle-dialog";
import { SectionError, SectionLoading } from "@/components/ui/section";
import { useBalances } from "@/lib/queries";
import { resolveSectionStatus } from "@/lib/sectionState";
import { amountToStroops } from "@/lib/currency";
import { useWalletDisconnected } from "@/lib/wallet-store";
import { simplifyDebts } from "@/lib/settlementUtils";

export function BalancesPanel({
  groupId,
  currentUserId,
}: {
  groupId: string;
  currentUserId: string;
}) {
  const { data, isLoading, isError, error, refetch } = useBalances(groupId);
  const [target, setTarget] = useState<SettleTarget | null>(null);
  // Settling requires a wallet signature — lock the action while the
  // wallet is disconnected.
  const walletDisconnected = useWalletDisconnected();

  const status = resolveSectionStatus({
    isLoading,
    isError,
    hasData: data !== undefined,
  });

  if (status === "loading") {
    return (
      <SectionLoading label="Loading balances" minHeight="min-h-[14rem]">
        <ListSkeleton rows={3} />
      </SectionLoading>
    );
  }

  // Never fall through to `?? []` on a failed request: an empty balance
  // list renders as "everyone's square", which is a different — and
  // financially misleading — statement from "we could not load this".
  if (status === "error") {
    return (
      <SectionError
        subject="the balances for this group"
        error={error}
        onRetry={() => refetch()}
      />
    );
  }

  const balances = data?.balances ?? [];
  const suggestions = data?.suggestions ?? [];
  const simplified = simplifyDebts(balances);
  const allSettled = balances.every(
    (b) => amountToStroops(b.net) === 0n
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 font-display text-sm uppercase tracking-widest text-ink/60">
          Net balances
        </h3>
        {balances.length === 0 ? (
          <EmptyState
            icon={<HandCoins className="h-7 w-7" />}
            title="No balances yet"
            description="Add an expense to see who owes who."
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {balances.map((b) => (
              <Card key={b.userId} className="flex items-center justify-between p-3">
                <span className="flex items-center gap-2">
                  <Avatar user={b.user} size="sm" />
                  <span className="text-sm font-bold">
                    {b.user.displayName}
                    {b.userId === currentUserId && (
                      <span className="ml-1 text-ink/40">(you)</span>
                    )}
                  </span>
                </span>
                <NetAmount value={b.net} assetCode={b.assetCode} />
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 font-display text-sm uppercase tracking-widest text-ink/60">
          Simplified settlement paths
        </h3>
        {allSettled || simplified.length === 0 ? (
          <EmptyState
            icon={<PartyPopper className="h-7 w-7" />}
            title="Everyone's square"
            description="There are no outstanding balances to settle in this group."
          />
        ) : (
          <div className="space-y-2">
            {simplified.map((s, i) => {
              const youPay = s.fromUserId === currentUserId;
              return (
                <Card key={i}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar user={s.from} size="sm" />
                      <span className="text-sm font-bold">
                        {youPay ? "You" : s.from.displayName}
                      </span>
                      <ArrowRight className="h-4 w-4 text-ink/40" />
                      <Avatar user={s.to} size="sm" />
                      <span className="text-sm font-bold">{s.to.displayName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Money value={s.amount} assetCode={s.assetCode} />
                      {youPay && (
                        <Button
                          size="sm"
                          onClick={() => setTarget({ to: s.to, amount: s.amount, assetCode: s.assetCode, assetIssuer: null, label: `Settle up with ${s.to.displayName}` })}
                          disabled={walletDisconnected}
                          title={
                            walletDisconnected
                              ? "Reconnect your wallet to settle"
                              : undefined
                          }
                        >
                          Settle
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <SettleDialog
        open={!!target}
        onClose={() => setTarget(null)}
        groupId={groupId}
        target={target}
      />
    </div>
  );
}
