"use client";

import { useState } from "react";
import { QRCodeCanvas } from "@/components/ui/lazy-qr-code";
import { Copy, Check, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShareQrModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  shareUrl: string;
  description?: string;
  label?: string;
}

export function ShareQrModal({
  open,
  onClose,
  title = "Share QR Code",
  shareUrl,
  description,
  label = "Link",
}: ShareQrModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <div className="flex flex-col items-center space-y-4 p-2 text-center">
        <div className="rounded-2xl border-3 border-ink bg-[#FFFDF5] p-5 shadow-brutal">
          <QRCodeCanvas
            value={shareUrl}
            size={220}
            level="M"
            marginSize={2}
            fgColor="#1E1B18"
            bgColor="#FFFDF5"
          />
        </div>

        <div className="flex w-full items-center gap-2">
          <input
            readOnly
            value={shareUrl}
            className="w-full truncate rounded-xl border-2 border-ink bg-paper px-3 py-2 text-xs font-mono select-all"
            aria-label={`${label} Share URL`}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            aria-label={`Copy ${label}`}
            className={cn("transition-colors", copied && "bg-lime text-ink")}
          >
            {copied ? <Check className="h-4 w-4 text-mint" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
