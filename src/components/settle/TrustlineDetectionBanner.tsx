"use client";

/**
 * TrustlineDetectionBanner
 *
 * Compact banner placed in the settlement review step. Detects whether the
 * connected wallet holds the required trustline for the target asset and,
 * when missing, presents an action to open the TrustlinePromptModal.
 *
 * XLM is native and always has a trustline — this component renders nothing
 * for native assets.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { hasTrustline } from "@/lib/stellar";

type DetectionStatus = "checking" | "ok" | "missing" | "error";

export function TrustlineDetectionBanner({
  publicKey,
  assetCode,
  assetIssuer,
  onSetupTrustline,
}: {
  /** Connected wallet's Stellar public key. */
  publicKey: string;
  /** Target asset code (e.g. "USDC"). */
  assetCode: string;
  /** Target asset issuer (null for native XLM). */
  assetIssuer: string | null;
  /** Called when the user clicks "Enable trustline". Should open the modal. */
  onSetupTrustline: () => void;
}) {
  const [status, setStatus] = useState<DetectionStatus>("checking");

  // Native assets always have a trustline
  const isNative = !assetIssuer;

  useEffect(() => {
    if (isNative) {
      setStatus("ok");
      return;
    }

    let cancelled = false;

    async function check() {
      try {
        const present = await hasTrustline(publicKey, assetCode, assetIssuer!);
        if (!cancelled) {
          setStatus(present ? "ok" : "missing");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    }

    void check();
    return () => { cancelled = true; };
  }, [publicKey, assetCode, assetIssuer, isNative]);

  // Native assets: no banner needed
  if (isNative) return null;

  // Still checking
  if (status === "checking") {
    return (
      <div className="flex items-center gap-2 rounded-xl border-2 border-ink bg-cream px-4 py-2.5 text-sm text-ink/60">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Checking {assetCode} trustline…</span>
      </div>
    );
  }

  // Trustline is present
  if (status === "ok") {
    return (
      <div className="flex items-center gap-2 rounded-xl border-2 border-ink bg-lime-pale px-4 py-2.5 text-sm">
        <ShieldCheck className="h-4 w-4 text-ink" />
        <span className="text-ink/70">
          <span className="font-medium">{assetCode}</span> trustline is active.
        </span>
      </div>
    );
  }

  // Error checking trustline
  if (status === "error") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink bg-butter-pale px-4 py-2.5 text-sm" role="alert">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-tangerine-dark" />
          <span>Could not verify {assetCode} trustline status.</span>
        </div>
        <Button size="sm" variant="outline" onClick={onSetupTrustline}>
          Check
        </Button>
      </div>
    );
  }

  // Missing trustline
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink bg-tangerine-pale px-4 py-2.5 text-sm" role="alert">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-tangerine-dark" />
        <span>
          Your wallet needs a{" "}
          <Badge tone="tangerine">{assetCode}</Badge>{" "}
          trustline before it can settle this payment.
        </span>
      </div>
      <Button size="sm" onClick={onSetupTrustline}>
        <Wallet className="h-3.5 w-3.5" /> Enable
      </Button>
    </div>
  );
}
