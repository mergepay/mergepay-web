"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STELLAR_NETWORK } from "@/lib/constants";
import { networkDisplayName } from "@/lib/walletStatus";
import type { WalletStatus } from "@/lib/walletStatus";

export function NetworkMismatchBanner({
  status,
  onRefresh,
}: {
  status: WalletStatus;
  onRefresh?: () => void;
}) {
  if (status.kind !== "network_mismatch") return null;

  const expected = networkDisplayName(STELLAR_NETWORK);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-wrap items-center justify-between gap-3 border-b-3 border-ink bg-flamingo px-4 py-3 md:px-8"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 h-5 w-5 shrink-0 text-ink"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="font-display text-sm uppercase tracking-wide text-ink">
            Wrong Stellar network
          </p>
          <p className="text-sm text-ink/80">
            {status.message} In Freighter, open{" "}
            <span className="font-bold">Settings → Network</span>, choose{" "}
            <span className="font-bold">{expected}</span>, then come back here.
            Signing and settlement stay disabled until the networks match.
          </p>
        </div>
      </div>
      {onRefresh && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRefresh}
          aria-label="Re-check the Freighter network"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Re-check network
        </Button>
      )}
    </div>
  );
}
