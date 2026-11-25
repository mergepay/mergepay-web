"use client";

/**
 * TrustlineStatusBadge
 *
 * Neobrutalist badge/card primitive displaying reliable USDC trustline and balance
 * information for connected Stellar accounts.
 *
 * Explicitly distinguishes:
 *  - Active trustline with balance
 *  - Active trustline with zero balance
 *  - Confirmed missing trustline (needs setup)
 *  - Unfunded account
 *  - Horizon / RPC network lookup error (never misreports as missing)
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, ShieldCheck, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/amount";
import {
  checkUsdcTrustlineStatus,
  type UsdcTrustlineStatusResult,
} from "@/lib/trustline";
import type { StellarNetwork } from "@/lib/types";

export interface TrustlineStatusBadgeProps {
  /** Connected account public key. */
  publicKey?: string | null;
  /** Stellar network target ("public" | "testnet"). */
  network?: StellarNetwork | string;
  /** Called when user clicks action to establish trustline. */
  onAddTrustline?: () => void;
  className?: string;
  showBalance?: boolean;
}

export function TrustlineStatusBadge({
  publicKey,
  network,
  onAddTrustline,
  className = "",
  showBalance = true,
}: TrustlineStatusBadgeProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<UsdcTrustlineStatusResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const res = await checkUsdcTrustlineStatus(publicKey, network);
      if (!cancelled) {
        setResult(res);
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [publicKey, network]);

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-1.5 rounded-lg border-2 border-ink bg-cream px-2.5 py-1 text-xs font-display uppercase tracking-wider shadow-brutal-sm ${className}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-ink/60" />
        <span>Checking USDC Trustline…</span>
      </div>
    );
  }

  if (!result || result.kind === "error") {
    return (
      <div
        role="status"
        aria-label="USDC trustline verification unavailable"
        className={`inline-flex items-center gap-1.5 rounded-lg border-2 border-ink bg-butter-pale px-2.5 py-1 text-xs font-display uppercase tracking-wider text-ink shadow-brutal-sm ${className}`}
      >
        <AlertTriangle className="h-3.5 w-3.5 text-tangerine-dark" />
        <span>USDC Status Unavailable</span>
      </div>
    );
  }

  if (result.kind === "unfunded") {
    return (
      <div
        role="status"
        aria-label="Account unfunded on Stellar"
        className={`inline-flex items-center gap-1.5 rounded-lg border-2 border-ink bg-tangerine-pale px-2.5 py-1 text-xs font-display uppercase tracking-wider text-ink shadow-brutal-sm ${className}`}
      >
        <Wallet className="h-3.5 w-3.5 text-tangerine-dark" />
        <span>Account Unfunded</span>
      </div>
    );
  }

  if (result.kind === "confirmed_missing") {
    return (
      <div
        role="alert"
        aria-label="USDC trustline missing"
        className={`inline-flex flex-wrap items-center gap-2 rounded-xl border-2 border-ink bg-tangerine-pale px-3 py-1.5 text-xs font-display uppercase tracking-wider shadow-brutal-sm ${className}`}
      >
        <div className="flex items-center gap-1.5 text-tangerine-dark font-bold">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>No USDC Trustline</span>
        </div>
        {onAddTrustline && (
          <Button
            size="sm"
            onClick={onAddTrustline}
            className="h-6 px-2 text-[10px] uppercase bg-cream"
          >
            Add Trustline
          </Button>
        )}
      </div>
    );
  }

  // confirmed_trusted or zero_balance_trusted
  return (
    <div
      role="status"
      aria-label={`USDC trustline active. Balance: ${result.balance} ${result.assetCode}`}
      className={`inline-flex items-center gap-2 rounded-xl border-2 border-ink bg-lime-pale px-3 py-1.5 text-xs font-display uppercase tracking-wider shadow-brutal-sm ${className}`}
    >
      <div className="flex items-center gap-1.5 text-ink font-bold">
        <ShieldCheck className="h-4 w-4 text-ink shrink-0" />
        <span>USDC Trustline Active</span>
      </div>
      {showBalance && (
        <span className="font-mono text-xs font-normal border-l-2 border-ink/20 pl-2">
          <Money value={result.balance} assetCode={result.assetCode} />
        </span>
      )}
    </div>
  );
}
