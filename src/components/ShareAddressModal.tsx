"use client";

import { useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShareAddressModalProps {
  open: boolean;
  onClose: () => void;
  stellarPublicKey: string;
  displayName?: string;
}

function truncateAddress(address: string, chars = 8): string {
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function ShareAddressModal({
  open,
  onClose,
  stellarPublicKey,
  displayName,
}: ShareAddressModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(stellarPublicKey);
      setCopied(true);
      toast.success("Stellar address copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy address");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share Your Address"
      description="Share your Stellar public key with others to receive payments"
    >
      <div className="flex flex-col items-center space-y-4 p-2 text-center">
        {displayName && (
          <p className="text-sm text-ink/70">
            Share your Stellar address with <span className="font-bold text-ink">{displayName}</span>
          </p>
        )}

        <div className="rounded-2xl border-3 border-ink bg-[#FFFDF5] p-5 shadow-brutal">
          <QRCodeCanvas
            value={stellarPublicKey}
            size={200}
            level="M"
            marginSize={2}
            fgColor="#18130E"
            bgColor="#FFFDF5"
          />
        </div>

        <div className="w-full space-y-1.5">
          <label className="font-display text-xs uppercase tracking-widest text-ink/70">
            Your Stellar Public Key
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 truncate rounded-xl border-2 border-ink bg-paper px-3 py-2 font-mono text-xs select-all">
              {stellarPublicKey}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              aria-label="Copy Stellar address to clipboard"
              className={cn(
                "transition-colors",
                copied && "bg-lime text-ink"
              )}
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <p className="text-xs text-ink/50">
          {truncateAddress(stellarPublicKey)}
        </p>

        <div className="flex items-center gap-2 rounded-xl border-2 border-ink bg-butter/40 p-3 w-full">
          <Share2 className="h-4 w-4 text-ink shrink-0" />
          <p className="text-xs text-ink/70 text-left">
            Share this QR code or copy the address to receive payments from others.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
