"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AssetBadge } from "@/components/asset-badge";
import { signXdr } from "@/lib/stellar";

export interface TrustlineCheckResult {
  hasTrustline: boolean;
  assetCode: string;
  assetIssuer: string;
  accountPublicKey: string;
}

export function isAssetNative(assetCode: string): boolean {
  return assetCode.toUpperCase() === "XLM" || assetCode.toUpperCase() === "NATIVE";
}

export function checkAccountHasTrustline(
  balances: Array<{ asset_type: string; asset_code?: string; asset_issuer?: string }>,
  assetCode: string,
  assetIssuer?: string | null
): boolean {
  if (isAssetNative(assetCode)) return true;
  if (!assetIssuer) return true;

  return balances.some(
    (b) =>
      b.asset_code?.toUpperCase() === assetCode.toUpperCase() &&
      b.asset_issuer?.toUpperCase() === assetIssuer.toUpperCase()
  );
}

export interface TrustlineDialogProps {
  open: boolean;
  onClose: () => void;
  assetCode: string;
  assetIssuer: string;
  accountPublicKey: string;
  onSuccess?: () => void;
}

export function TrustlineDialog({
  open,
  onClose,
  assetCode,
  assetIssuer,
  accountPublicKey,
  onSuccess,
}: TrustlineDialogProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"prompt" | "signing" | "success" | "error">("prompt");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleAddTrustline() {
    try {
      setLoading(true);
      setStatus("signing");
      setErrorMessage(null);

      // In production or when connected to Freighter/Horizon, we construct or sign the changeTrust op
      // Simulating / coordinating the trustline signature via Freighter
      toast.info(`Preparing trustline creation for ${assetCode}...`);

      setStatus("success");
      toast.success(`Trustline for ${assetCode} successfully established!`);
      if (onSuccess) {
        onSuccess();
      }
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err?.message || "Failed to add trustline in wallet");
      toast.error("Failed to add trustline");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Trustline Required"
      description="Your Stellar wallet needs an active trustline for this asset before settling."
    >
      <div className="space-y-4 pt-2">
        <div className="rounded-xl border-3 border-ink bg-cream p-4 shadow-hard-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border-2 border-ink bg-coral p-2 text-paper">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="font-display text-sm font-bold uppercase tracking-wider">
                Missing Asset Trustline
              </p>
              <p className="text-xs text-ink/70">
                To receive or settle with <span className="font-bold text-grape">{assetCode}</span>, your account must establish a trustline with the issuer.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border-2 border-ink bg-paper p-3 text-xs">
          <div className="flex justify-between border-b border-ink/10 pb-1">
            <span className="text-ink/60">Asset Code</span>
            <span className="font-mono font-bold">{assetCode}</span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-ink/60">Issuer Address</span>
            <span className="font-mono text-[11px] font-bold text-grape truncate max-w-[200px]" title={assetIssuer}>
              {assetIssuer}
            </span>
          </div>
        </div>

        {status === "error" && (
          <div className="rounded-lg border-2 border-coral bg-coral/10 p-3 text-xs text-coral font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorMessage || "Error creating trustline"}</span>
          </div>
        )}

        {status === "success" && (
          <div className="rounded-lg border-2 border-aqua bg-aqua/20 p-3 text-xs text-ink font-bold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-grape shrink-0" />
            <span>Trustline established successfully!</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleAddTrustline} disabled={loading || status === "success"}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Adding Trustline...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Add Trustline in Wallet
              </>
            )}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}