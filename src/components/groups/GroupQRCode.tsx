"use client";

import { QRCodeSVG } from "qrcode.react";
import CopyButton from "../ui/CopyButton";
import { Card, CardContent } from "../ui/card";
import { Input, Label } from "../ui/input";
import { QrCode } from "lucide-react";

export interface GroupQRCodeProps {
  inviteUrl: string;
  className?: string;
}

/**
 * A prominent neobrutalist card rendering a high-contrast QR code pointing to the group invite URL,
 * complete with responsive sizing and a one-click copy button.
 */
export function GroupQRCode({ inviteUrl, className }: GroupQRCodeProps) {
  return (
    <Card className={className}>
      <div className="border-b-3 border-ink bg-butter px-4 py-3 flex items-center gap-2">
        <QrCode className="h-4 w-4 text-ink" />
        <h3 className="font-display text-sm uppercase tracking-widest">Quick Group Invite</h3>
      </div>
      <CardContent className="flex flex-col items-center space-y-4 pt-4">
        <div className="rounded-2xl border-3 border-ink bg-white p-4 shadow-brutal flex justify-center">
          <QRCodeSVG
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
      </CardContent>
    </Card>
  );
}
