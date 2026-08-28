"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Sparkles, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { prepareTrustlineXdr, signXdr, WalletError } from "@/lib/stellar";

export interface TrustlineModalProps {
  open: boolean;
  onClose: () => void;
  assetCode: string;
  assetIssuer: string;
  accountPublicKey?: string;
  assetName?: string;
  onSuccess?: () => void;
}

export function TrustlineModal({
  open,
  onClose,
  assetCode,
  assetIssuer,
  accountPublicKey = "",
  assetName,
  onSuccess,
}: TrustlineModalProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"prompt" | "signing" | "success" | "error">("prompt");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyIssuer = () => {
    if (assetIssuer) {
      navigator.clipboard.writeText(assetIssuer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  async function handleAddTrustline() {
    if (!assetIssuer) {
      setErrorMessage("Asset issuer is missing.");
      setStatus("error");
      return;
    }

    try {
      setLoading(true);
      setStatus("signing");
      setErrorMessage(null);

      // 1. Prepare trustline XDR transaction envelope
      const unsignedXdr = await prepareTrustlineXdr(
        accountPublicKey,
        assetCode,
        assetIssuer
      );

      // 2. Sign transaction via Freighter wallet
      await signXdr(unsignedXdr);

      setStatus("success");
      toast.success(`Trustline for ${assetCode} successfully established!`);

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        onClose();
        setStatus("prompt");
      }, 1200);
    } catch (err: unknown) {
      setStatus("error");
      if (err instanceof WalletError) {
        setErrorMessage(err.message);
        toast.error(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message || "Failed to add trustline in wallet");
        toast.error(err.message || "Failed to add trustline");
      } else {
        const msg = "Failed to add trustline in wallet";
        setErrorMessage(msg);
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const resetAndClose = () => {
    if (loading) return;
    setStatus("prompt");
    setErrorMessage(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={resetAndClose}
      title="Add Asset Trustline"
      description={`Add a trustline for ${assetCode} to your Stellar wallet to send, receive, and settle.`}
      dismissible={!loading}
    >
      <div className="space-y-4 pt-1">
        {/* Banner */}
        <div className="rounded-xl border-3 border-ink bg-tangerine-pale p-4 shadow-brutal-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border-2 border-ink bg-cream p-2 text-tangerine-dark shrink-0">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-display text-sm font-bold uppercase tracking-wider text-ink">
                Trustline Verification Required
              </h4>
              <p className="text-xs text-ink/80 leading-relaxed">
                Stellar accounts require an active trustline for non-native assets.
                Establish trust for <span className="font-bold text-grape">{assetName ?? assetCode}</span> ({assetCode}) before proceeding with settlements.
              </p>
            </div>
          </div>
        </div>

        {/* Asset Details Box */}
        <div className="space-y-2.5 rounded-xl border-3 border-ink bg-paper p-4 text-xs shadow-brutal-sm">
          <div className="flex items-center justify-between border-b-2 border-ink/10 pb-2">
            <span className="font-display uppercase text-ink/60 font-bold">Asset Code</span>
            <span className="font-mono font-bold text-sm text-ink">{assetCode}</span>
          </div>

          {assetName && (
            <div className="flex items-center justify-between border-b-2 border-ink/10 pb-2">
              <span className="font-display uppercase text-ink/60 font-bold">Asset Name</span>
              <span className="font-bold text-ink">{assetName}</span>
            </div>
          )}

          <div className="flex flex-col gap-1 pt-1">
            <span className="font-display uppercase text-ink/60 font-bold">Issuer Address</span>
            <div className="flex items-center justify-between gap-2 rounded-lg border-2 border-ink bg-cream p-2 font-mono text-[11px] font-bold text-grape">
              <span className="truncate max-w-[320px]" title={assetIssuer}>
                {assetIssuer}
              </span>
              <button
                type="button"
                onClick={handleCopyIssuer}
                className="shrink-0 p-1 rounded hover:bg-butter border border-ink/30 transition-colors"
                title="Copy Issuer Address"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-lime-dark" /> : <Copy className="h-3.5 w-3.5 text-ink" />}
              </button>
            </div>
          </div>
        </div>

        {/* Error Alert State */}
        {status === "error" && (
          <div className="rounded-xl border-3 border-ink bg-coral/15 p-3.5 text-xs text-coral font-bold flex items-start gap-2.5 shadow-brutal-sm" role="alert">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-coral" />
            <div className="space-y-0.5">
              <p className="font-display uppercase tracking-wide text-ink font-bold">Transaction Error</p>
              <p className="text-ink/80 font-medium">{errorMessage || "Error creating trustline"}</p>
            </div>
          </div>
        )}

        {/* Success Alert State */}
        {status === "success" && (
          <div className="rounded-xl border-3 border-ink bg-lime/30 p-3.5 text-xs text-ink font-bold flex items-center gap-2.5 shadow-brutal-sm" role="status">
            <CheckCircle2 className="h-5 w-5 text-lime-dark shrink-0" />
            <div>
              <p className="font-display uppercase tracking-wide text-ink font-bold">Trustline Established!</p>
              <p className="text-ink/80 text-[11px]">Your account can now receive and settle {assetCode}.</p>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button variant="outline" onClick={resetAndClose} disabled={loading}>
            Cancel
          </Button>

          <Button
            onClick={handleAddTrustline}
            disabled={loading || status === "success"}
            className="bg-lime hover:bg-lime-dark text-ink border-2 border-ink shadow-brutal-sm"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Confirming in Wallet...
              </>
            ) : status === "success" ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Added
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1.5" /> Add Trustline via Freighter
              </>
            )}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
