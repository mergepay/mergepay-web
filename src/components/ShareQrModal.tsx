"use client";

import { QRCodeCanvas } from "qrcode.react";
import { Copy, Check, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ShareQrModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  shareUrl: string;
  description?: string;
}

export function ShareQrModal({
  open,
  onClose,
  title,
  shareUrl,
  description,
}: ShareQrModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex flex-col items-center space-y-4 p-2 text-center">
        {description && <p className="text-sm text-ink/70">{description}</p>}

        <div className="rounded-2xl border-2 border-ink bg-white p-4 shadow-brutal">
          <QRCodeCanvas
            value={shareUrl}
            size={220}
            level="M"
            marginSize={2}
          />
        </div>

        <div className="flex w-full items-center gap-2">
          <input
            readOnly
            value={shareUrl}
            className="w-full truncate rounded-xl border-2 border-ink bg-paper px-3 py-2 text-xs font-mono select-all"
          />
          <Button size="sm" variant="outline" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 text-mint" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}