"use client";

/**
 * Trustline status checker.
 *
 * Before a user can settle expenses in an issued Stellar asset (e.g. USDC),
 * their account must hold an active trustline for that asset. This component
 * loads the connected account's Horizon balances and renders a warning banner
 * with a call-to-action when the required asset's trustline is missing.
 * Native XLM never requires a trustline, so nothing is rendered for it.
 *
 * The check runs against `src/lib/trustline.ts`, which wraps the Horizon
 * accounts endpoint and mirrors how the rest of the app reads balances.
 */

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  fetchHorizonAccountBalances,
  missingTrustlines,
  type ConfiguredAsset,
} from "@/lib/trustline";

export interface TrustlineCheckerProps {
  /** Connected account public key (G...). */
  publicKey?: string | null;
  /** Assets that require an active trustline. Native XLM is ignored. */
  requiredAssets: ConfiguredAsset[];
  /** Called when the user asks to establish the missing trustline. */
  onAddTrustline?: () => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "missing"; assets: ConfiguredAsset[] }
  | { kind: "unavailable" };

export function TrustlineChecker({ publicKey, requiredAssets, onAddTrustline }: TrustlineCheckerProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    // Only issued assets can require a trustline; native XLM never does.
    const checkable = requiredAssets.filter((asset) => asset.issuer !== null);
    if (!publicKey || checkable.length === 0) {
      setStatus({ kind: "idle" });
      return;
    }

    let cancelled = false;
    setStatus({ kind: "loading" });
    (async () => {
      const balances = await fetchHorizonAccountBalances(publicKey);
      if (cancelled) return;
      if (balances.length === 0) {
        // The account could not be read (unfunded, network error); don't show
        // a misleading warning.
        setStatus({ kind: "unavailable" });
        return;
      }
      const missing = missingTrustlines(balances, requiredAssets);
      setStatus(missing.length > 0 ? { kind: "missing", assets: missing } : { kind: "ok" });
    })();

    return () => {
      cancelled = true;
    };
  }, [publicKey, requiredAssets]);

  if (status.kind !== "missing") return null;

  return (
    <div
      className="flex items-start gap-3 rounded-2xl border-3 border-ink bg-flamingo-pale p-4 shadow-brutal-sm"
      role="alert"
      data-testid="trustline-warning"
    >
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream"
        aria-hidden="true"
      >
        <AlertTriangle className="h-4 w-4" />
      </span>
      <div>
        <p className="font-display text-sm uppercase tracking-tight">
          Trustline required
        </p>
        <p className="text-sm">
          Your account needs an active trustline for{" "}
          <strong>{status.assets.map((asset) => asset.code).join(", ")}</strong> before you
          can settle in {status.assets.length === 1 ? "that asset" : "those assets"}.
        </p>
        {onAddTrustline && (
          <button
            type="button"
            onClick={onAddTrustline}
            className="mt-3 inline-flex items-center rounded-xl border-3 border-ink bg-cream px-4 py-2 font-display text-xs uppercase tracking-wide shadow-brutal-sm transition-transform hover:-translate-y-0.5"
          >
            Add trustline
          </button>
        )}
      </div>
    </div>
  );
}
