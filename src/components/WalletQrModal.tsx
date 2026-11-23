"client";

import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog } from "@/components/ui/dialog";
import CopyButton from "@/components/ui/CopyButton";

export interface WalletQrModalProps {
  open: boolean;
  onClose: () => void;
  address: string;
  title?: string;
  description?: string;
}

export function WalletQrModal({
  open,
  onClose,
  address,
  title = "Share Wallet Address",
  description = "Scan the QR code or copy your Stellar public key to share.",
}: WalletQrModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
    >
      <div className="flex flex-col items-center justify-center space-y-4 py-2">
        <div className="rounded-2xl border-3 border-ink bg-white p-4 shadow-brutal">
          <QRCodeSVG
            value={address || ""}
            size={200}
            level="M"
            includeMargin={true}
          />
        </div>

        <div className="w-full space-y-2 rounded-xl border-2 border-ink bg-cream p-3 text-center">
          <p className="font-mono text-xs break-all text-ink/80 select-all">
            {address}
          </p>
          <div className="flex justify-center pt-1">
            <CopyButton text={address} label="Copy Address" what="wallet address" />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
