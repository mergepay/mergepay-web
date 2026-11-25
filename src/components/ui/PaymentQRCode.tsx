"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AlertCircle, Check, Copy, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PaymentQRCodeProps {
  address?: string | null;
  amount?: string | number | null;
  memo?: string | null;
  memoType?: "MEMO_TEXT" | "MEMO_ID" | "MEMO_HASH" | "MEMO_RETURN";
  assetCode?: string | null;
  assetIssuer?: string | null;
  size?: number;
  className?: string;
  showCopyButton?: boolean;
  showPayloadPreview?: boolean;
  label?: string;
  fallbackMessage?: string;
}

/**
 * Builds a standardized Stellar SEP-0007 payment URI.
 * Example: web+stellar:pay?destination=G...&amount=10&memo=MP%3A123&memo_type=MEMO_TEXT
 */
export function buildStellarPaymentUri({
  address,
  amount,
  memo,
  memoType = "MEMO_TEXT",
  assetCode,
  assetIssuer,
}: {
  address?: string | null;
  amount?: string | number | null;
  memo?: string | null;
  memoType?: string;
  assetCode?: string | null;
  assetIssuer?: string | null;
}): string {
  if (!address) return "";

  // If the address is already a complete URI, return it directly
  if (address.startsWith("web+stellar:") || address.startsWith("stellar:")) {
    return address;
  }

  const params = new URLSearchParams();
  params.set("destination", address.trim());

  if (amount !== undefined && amount !== null && String(amount).trim() !== "") {
    params.set("amount", String(amount).trim());
  }

  if (assetCode && assetCode.toUpperCase() !== "XLM") {
    params.set("asset_code", assetCode.trim());
    if (assetIssuer) {
      params.set("asset_issuer", assetIssuer.trim());
    }
  }

  if (memo && memo.trim() !== "") {
    params.set("memo", memo.trim());
    params.set("memo_type", memoType);
  }

  return `web+stellar:pay?${params.toString()}`;
}

export function PaymentQRCode({
  address,
  amount,
  memo,
  memoType = "MEMO_TEXT",
  assetCode = "XLM",
  assetIssuer,
  size = 200,
  className,
  showCopyButton = true,
  showPayloadPreview = true,
  label = "Stellar payment request",
  fallbackMessage,
}: PaymentQRCodeProps) {
  const [copied, setCopied] = useState(false);

  // Validate required fields for generating payment QR code
  const trimmedAddress = address?.trim() || "";
  const trimmedAmount = amount !== undefined && amount !== null ? String(amount).trim() : "";
  const isAmountValid = trimmedAmount !== "" && !isNaN(Number(trimmedAmount)) && Number(trimmedAmount) > 0;

  const hasMissingAddress = !trimmedAddress;
  const hasMissingAmount = !isAmountValid;

  if (hasMissingAddress || hasMissingAmount) {
    let reason = fallbackMessage;
    if (!reason) {
      if (hasMissingAddress && hasMissingAmount) {
        reason = "Recipient Stellar address and payment amount are required to generate a payment QR code.";
      } else if (hasMissingAddress) {
        reason = "Recipient Stellar public key is required to generate a payment QR code.";
      } else {
        reason = "A valid payment amount is required to generate a payment QR code.";
      }
    }

    return (
      <div
        role="alert"
        aria-label="Payment QR code unavailable"
        className={cn(
          "flex flex-col items-center justify-center p-6 rounded-2xl border-3 border-ink bg-butter-pale text-center space-y-3 shadow-brutal-sm w-full max-w-sm mx-auto",
          className
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-cream shadow-brutal-sm">
          <AlertCircle className="h-6 w-6 text-ink/70" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="font-display text-sm uppercase tracking-wider text-ink">
            QR Code Unavailable
          </p>
          <p className="text-xs text-ink/70 max-w-xs">{reason}</p>
        </div>
      </div>
    );
  }

  const paymentUri = buildStellarPaymentUri({
    address: trimmedAddress,
    amount: trimmedAmount,
    memo,
    memoType,
    assetCode,
    assetIssuer,
  });

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API not available");
      }
      await navigator.clipboard.writeText(paymentUri);
      setCopied(true);
      toast.success("Payment request copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy payment URI. Please copy it manually.");
    }
  };

  return (
    <div className={cn("flex flex-col items-center space-y-3 w-full max-w-sm mx-auto", className)}>
      <div
        className="rounded-2xl border-3 border-ink bg-[#FFFDF5] p-4 shadow-brutal flex items-center justify-center max-w-full"
        data-testid="payment-qr-container"
      >
        <QRCodeSVG
          value={paymentUri}
          size={size}
          level="M"
          marginSize={2}
          fgColor="#18130E"
          bgColor="#FFFDF5"
          className="max-w-full h-auto"
          aria-label={label}
        />
      </div>

      <p className="text-xs text-ink/60 text-center">
        Scan with any Stellar mobile wallet (Freighter Mobile, Lobstr, Solar) to pay.
      </p>

      {showPayloadPreview && (
        <div className="w-full text-center">
          <span className="font-mono text-[11px] text-ink/50 break-all select-all block px-2 py-1 rounded bg-paper border border-ink/20">
            {paymentUri}
          </span>
        </div>
      )}

      {showCopyButton && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleCopy}
          aria-label="Copy payment URI to clipboard"
          className={cn(
            "transition-colors font-display uppercase tracking-wider text-xs w-full sm:w-auto",
            copied && "bg-lime text-ink"
          )}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-1.5" /> Copied URI
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-1.5" /> Copy Payment URI
            </>
          )}
        </Button>
      )}
    </div>
  );
}
