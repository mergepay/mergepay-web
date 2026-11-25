"use client";

import React, { useMemo } from "react";
import { QRCodeCanvas } from "@/components/ui/lazy-qr-code";
import { Dialog } from "@/components/ui/dialog";
import CopyButton from "@/components/ui/CopyButton";
import { buildStellarPaymentUri } from "@/components/ui/PaymentQRCode";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PaymentQrModalProps {
  open: boolean;
  onClose: () => void;
  stellarAddress?: string | null;
  paymentUri?: string | null;
  amount?: string | number | null;
  assetCode?: string | null;
  assetIssuer?: string | null;
  memo?: string | null;
  title?: string;
  description?: string;
  className?: string;
}

export function PaymentQrModal({
  open,
  onClose,
  stellarAddress,
  paymentUri,
  amount,
  assetCode,
  assetIssuer,
  memo,
  title = "Receive Stellar Payment",
  description = "Scan this QR code with a Stellar wallet to complete the payment or split expense.",
  className,
}: PaymentQrModalProps) {
  const qrPayload = useMemo(() => {
    if (paymentUri && paymentUri.trim()) {
      return paymentUri.trim();
    }
    if (stellarAddress && stellarAddress.trim()) {
      if (amount || assetCode || memo) {
        return buildStellarPaymentUri({
          address: stellarAddress,
          amount,
          assetCode,
          assetIssuer,
          memo,
        });
      }
      return stellarAddress.trim();
    }
    return "";
  }, [paymentUri, stellarAddress, amount, assetCode, assetIssuer, memo]);

  const hasPayload = Boolean(qrPayload);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      className={cn("sm:max-w-md", className)}
    >
      <div className="flex flex-col items-center space-y-4 p-2 text-center">
        {hasPayload ? (
          <>
            <div
              className="flex w-full max-w-[260px] items-center justify-center rounded-2xl border-3 border-ink bg-[#FFFDF5] p-5 shadow-brutal-md"
              data-testid="qr-container"
            >
              <QRCodeCanvas
                value={qrPayload}
                size={200}
                level="M"
                marginSize={2}
                fgColor="#18130E"
                bgColor="#FFFDF5"
              />
            </div>

            <div className="w-full space-y-1.5 text-left">
              <label
                htmlFor="payment-qr-payload"
                className="font-display text-xs uppercase tracking-widest text-ink/70"
              >
                Payment Request Payload
              </label>
              <div className="flex items-center gap-2">
                <div
                  id="payment-qr-payload"
                  className="flex-1 truncate rounded-xl border-2 border-ink bg-paper px-3 py-2 font-mono text-xs select-all"
                  title={qrPayload}
                >
                  {qrPayload}
                </div>
                <CopyButton text={qrPayload} what="Payment request" />
              </div>
            </div>

            {(amount || assetCode) && (
              <div className="flex w-full items-center justify-between rounded-xl border-2 border-ink bg-cream px-3 py-2 text-xs font-bold text-ink">
                <span>Requested Amount:</span>
                <span className="font-mono text-sm">
                  {amount ?? "--"} {assetCode ?? "XLM"}
                </span>
              </div>
            )}
          </>
        ) : (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border-2 border-ink bg-flamingo-pale p-4 text-xs font-bold text-ink"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>No valid Stellar address or payment URI provided.</span>
          </div>
        )}
      </div>
    </Dialog>
  );
}
