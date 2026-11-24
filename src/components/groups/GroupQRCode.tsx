"use client";

import { useRef } from "react";
import { QRCodeSVG } from "@/components/ui/lazy-qr-code";
import CopyButton from "../ui/CopyButton";
import { Card, CardContent } from "../ui/card";
import { Input, Label } from "../ui/input";
import { Button } from "../ui/button";
import { QrCode, Download } from "lucide-react";
import { toast } from "sonner";

export interface GroupQRCodeProps {
  inviteUrl: string;
  className?: string;
}

/**
 * A prominent neobrutalist card rendering a high-contrast QR code pointing to the group invite URL,
 * complete with responsive sizing, a one-click copy button, and download functionality.
 */
export function GroupQRCode({ inviteUrl, className }: GroupQRCodeProps) {
  const qrRef = useRef<SVGSVGElement>(null);

  const handleDownload = async () => {
    if (!qrRef.current) return;

    try {
      const svgElement = qrRef.current;
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        toast.error("Failed to generate QR code image");
        return;
      }

      const img = new Image();
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        canvas.width = 500;
        canvas.height = 500;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 10, 10, 480, 480);
        
        const pngUrl = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.href = pngUrl;
        downloadLink.download = "mergepay-qr-code.png";
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        URL.revokeObjectURL(url);
        toast.success("QR code downloaded");
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        toast.error("Failed to generate QR code image");
      };

      img.src = url;
    } catch (error) {
      toast.error("Failed to download QR code");
    }
  };

  return (
    <Card className={className}>
      <div className="border-b-3 border-ink bg-butter px-4 py-3 flex items-center gap-2">
        <QrCode className="h-4 w-4 text-ink" />
        <h3 className="font-display text-sm uppercase tracking-widest">Quick Group Invite</h3>
      </div>
      <CardContent className="flex flex-col items-center space-y-4 pt-4 p-4 sm:p-6 w-full">
        <div className="rounded-2xl border-3 border-ink bg-white p-4 sm:p-6 shadow-brutal flex justify-center w-full max-w-[280px] aspect-square items-center">
          <QRCodeSVG
            ref={qrRef}
            value={inviteUrl}
            size={180}
            fgColor="#18130E"
            bgColor="#FFFFFF"
            level="M"
          />
        </div>
        <div className="w-full space-y-1.5">
          <Label htmlFor="group-invite-url-input">Invite link</Label>
          <div className="flex items-center gap-2">
            <Input
              id="group-invite-url-input"
              readOnly
              value={inviteUrl}
              className="font-mono text-xs"
            />
            <CopyButton text={inviteUrl} label="Copy" />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          className="w-full"
        >
          <Download className="h-4 w-4 mr-2" aria-hidden="true" />
          Download QR Code
        </Button>
      </CardContent>
    </Card>
  );
}
