"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasTrustline, prepareTrustlineXdr, signXdr } from "@/lib/stellar";

export function TrustlineGate({ publicKey, assetCode, issuer, children }: { publicKey: string; assetCode: string; issuer: string | null; children: ReactNode }) {
  const [present, setPresent] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let live = true; if (!issuer) { setPresent(true); return; } hasTrustline(publicKey, assetCode, issuer).then((value) => live && setPresent(value)).catch(() => live && setError("Could not check the trustline.")); return () => { live = false; }; }, [publicKey, assetCode, issuer]);
  async function enable() {
    if (!issuer) return; setBusy(true); setError(null);
    try { const xdr = await prepareTrustlineXdr(publicKey, assetCode, issuer); await signXdr(xdr); setPresent(true); }
    catch { setError("Trustline setup was cancelled or failed. No settlement was submitted."); }
    finally { setBusy(false); }
  }
  if (present === null && !error) return <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Checking {assetCode} trustline…</div>;
  if (present === false || error) return <div className="space-y-3 rounded-xl border-2 border-ink bg-butter-pale p-4" role="alert"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-5 w-5" /><p className="text-sm">Your wallet needs an {assetCode} trustline before it can settle this payment.</p></div>{error && <p className="text-xs text-flamingo">{error}</p>}<Button type="button" onClick={enable} loading={busy}>Enable {assetCode} trustline</Button></div>;
  return <>{children}</>;
}
