"use client";

import React, { useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Check, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface GroupQRCodeProps {
  inviteUrl: string;
  groupName: string;
}

export function GroupQRCode({ inviteUrl, groupName }: GroupQRCodeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success("Invite link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy invite link");
    }
  };

  return (
    <div className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_#000] flex flex-col items-center text-center">
      <div className="flex items-center gap-2 mb-4 font-black text-lg">
        <QrCode className="w-6 h-6" />
        <span>Invite to {groupName}</span>
      </div>
      
      <div className="p-4 border-2 border-black bg-white mb-4">
        <QRCodeCanvas
          value={inviteUrl}
          size={180}
          level={"H"}
          includeMargin={true}
        />
      </div>

      <p className="text-xs text-neutral-600 mb-4 break-all max-w-xs">
        {inviteUrl}
      </p>

      <Button
        onClick={handleCopy}
        className="w-full flex items-center justify-center gap-2 border-2 border-black bg-[#FFDE59] text-black font-bold hover:bg-[#fccb06] shadow-[2px_2px_0px_0px_#000]"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4" /> Copied!
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" /> Copy Invite Link
          </>
        )}
      </Button>
    </div>
  );
}
