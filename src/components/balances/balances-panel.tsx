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
import { useBalances } from "@/lib/queries";

export function BalancesPanel({
  groupId,
  currentUserId,
}: {
  groupId: string;
  currentUserId: string;
}) {
  const { data, isLoading } = useBalances(groupId);
  const [target, setTarget] = useState<SettleTarget | null>(null);

  if (isLoading) return <ListSkeleton rows={3} />;

  const balances = data?.balances ?? [];
  const suggestions = data?.suggestions ?? [];
  const allSettled = balances.every(
    (b) => Math.abs(parseFloat(b.net)) < 0.0000001
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
          Settle up
        </h3>
        {allSettled || suggestions.length === 0 ? (
          <EmptyState
            icon={<PartyPopper className="h-7 w-7" />}
            title="Everyone's square"
            description="There are no outstanding balances to settle in this group."
          />
        ) : (
          <div className="space-y-2">
            {suggestions.map((s, i) => {
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
                          onClick={() => setTarget(suggestionToTarget(s))}
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
