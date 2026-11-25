"client";

import { useState } from "react";
import { QRCodeCanvas } from "@/components/ui/lazy-qr-code";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

export interface AddressQRCodeProps {
  value: string;
  size?: number;
  className?: string;
  showCopyButton?: boolean;
  label?: string;
}

export function AddressQRCode({
  value,
  size = 180,
  className,
  showCopyButton = true,
  label = "Stellar address",
}: AddressQRCodeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API not available");
      }
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}. Please copy it manually.`);
    }
  };

  return (
    <div className={cn("flex flex-col items-center space-y-3", className)}>
      <div className="rounded-2xl border-3 border-ink bg-[#FFFDF5] p-4 shadow-brutal">
        <QRCodeCanvas
          value={value}
          size={size}
          level="M"
          marginSize={2}
          fgColor="#18130E"
          bgColor="#FFFDF5"
        />
      </div>
      {showCopyButton && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopy}
          aria-label={`Copy ${label} to clipboard`}
          className={cn(
            "transition-colors font-display uppercase tracking-wider text-xs",
            copied && "bg-lime text-ink"
          )}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-1.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-1.5" /> Copy {label}
            </>
          )}
        </Button>
      )}
    </div>
  );
}
