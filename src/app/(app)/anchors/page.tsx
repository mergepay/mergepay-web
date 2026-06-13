"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { AssetBadge } from "@/components/asset-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { useAnchors, useAnchorSessions } from "@/lib/queries";
import { api, ApiRequestError } from "@/lib/api";
import { signXdr, WalletError } from "@/lib/stellar";
import { fullDate } from "@/lib/format";
import type { AnchorSessionKind } from "@/lib/types";

export default function AnchorsPage() {
  const anchors = useAnchors();
  const sessions = useAnchorSessions();
  const [busy, setBusy] = useState<string | null>(null);

  async function startFlow(
    kind: AnchorSessionKind,
    assetCode: string,
    anchorName: string
  ) {
    const key = `${kind}-${assetCode}`;
    setBusy(key);
    try {
      // 1. API creates a session and fetches a SEP-10 challenge from the anchor.
      const start =
        kind === "deposit"
          ? await api.anchorDeposit({ assetCode, anchorName })
          : await api.anchorWithdraw({ assetCode, anchorName });

      // 2. Sign the anchor's challenge in the wallet.
      const signedXdr = await signXdr(
        start.challenge.transaction,
        start.challenge.networkPassphrase
      );

      // 3. Exchange for the SEP-24 interactive URL.
      const { session } = await api.anchorComplete(start.session.id, {
        signedXdr,
      });

      sessions.refetch();
      if (session.interactiveUrl) {
        window.open(session.interactiveUrl, "_blank", "noopener,noreferrer");
        toast.success("Anchor flow opened in a new tab");
      } else {
        toast.success("Anchor session started");
      }
    } catch (e) {
      if (e instanceof WalletError) toast.error(e.message);
      else if (e instanceof ApiRequestError) toast.error(e.message);
      else toast.error("Could not start anchor flow");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Anchors"
        description="Move between fiat and Stellar assets through SEP-24 anchors — no crypto workflow required."
      />

      {anchors.isLoading ? (
        <ListSkeleton rows={2} />
      ) : anchors.data?.anchors.length ? (
        <div className="space-y-4">
          {anchors.data.anchors.map((anchor) => (
            <Card key={anchor.name}>
              <div className="flex items-center justify-between border-b-3 border-ink bg-tangerine px-5 py-3">
                <div className="flex items-center gap-2">
                  <Banknote className="h-5 w-5" />
                  <span className="font-display text-sm uppercase tracking-tight">
                    {anchor.name}
                  </span>
                </div>
                <span className="font-mono text-xs text-ink/70">
                  {anchor.homeDomain}
                </span>
              </div>
              <CardContent className="space-y-3 pt-4">
                {anchor.assets.map((asset) => {
                  const dKey = `deposit-${asset.code}`;
                  const wKey = `withdrawal-${asset.code}`;
                  return (
                    <div
                      key={asset.code}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-ink bg-paper px-4 py-3"
                    >
                      <AssetBadge code={asset.code} />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          loading={busy === dKey}
                          onClick={() =>
                            startFlow("deposit", asset.code, anchor.name)
                          }
                        >
                          <ArrowDownToLine className="h-4 w-4" /> Deposit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={busy === wKey}
                          onClick={() =>
                            startFlow("withdrawal", asset.code, anchor.name)
                          }
                        >
                          <ArrowUpFromLine className="h-4 w-4" /> Withdraw
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Banknote className="h-7 w-7" />}
          title="No anchors configured"
          description="The API exposes available SEP-24 anchors. Configure one to enable fiat on/off-ramp."
        />
      )}

      <h2 className="mb-3 mt-10 font-display text-xl uppercase tracking-tight">
        Your transfers
      </h2>
      {sessions.isLoading ? (
        <ListSkeleton rows={2} />
      ) : sessions.data?.sessions.length ? (
        <div className="space-y-2">
          {sessions.data.sessions.map((s) => (
            <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 border-ink ${
                    s.kind === "deposit" ? "bg-lime" : "bg-tangerine"
                  }`}
                >
                  {s.kind === "deposit" ? (
                    <ArrowDownToLine className="h-4 w-4" />
                  ) : (
                    <ArrowUpFromLine className="h-4 w-4" />
                  )}
                </span>
                <div>
                  <p className="font-bold capitalize">
                    {s.kind} · {s.assetCode}
                  </p>
                  <p className="text-xs text-ink/50">
                    {s.anchorName} · {fullDate(s.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(s.status)}>
                  {s.status.replace(/_/g, " ")}
                </Badge>
                {s.interactiveUrl && (
                  <a
                    href={s.interactiveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="sm" variant="ghost">
                      Resume <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink/50">No anchor transfers yet.</p>
      )}
    </>
  );
}
