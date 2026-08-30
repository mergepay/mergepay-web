"use client";

import { QRCodeCanvas } from "qrcode.react";
import { Copy, Check, QrCode, Camera, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseInviteCode } from "@/lib/inviteLink";

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
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"code" | "scan">("code");
  const [scanInput, setScanInput] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);

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

  const handleJoinFromScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;

    const parsed = parseInviteCode(scanInput.trim());
    if (!parsed.ok) {
      setScanError("Invalid QR code or invite URL format");
      return;
    }

    setScanError(null);
    toast.success(`Joining group code ${parsed.code}...`);
    onClose();
    router.push(`/groups/join?code=${parsed.code}`);
  };

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex flex-col items-center space-y-4 p-2 text-center">
        {/* Mode Selector */}
        <div className="flex w-full gap-2 rounded-xl border-2 border-ink bg-cream p-1">
          <button
            type="button"
            onClick={() => setMode("code")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-display uppercase tracking-wider transition-all ${
              mode === "code"
                ? "border-2 border-ink bg-grape text-white shadow-brutal-sm font-bold"
                : "text-ink/70 hover:text-ink"
            }`}
          >
            <QrCode className="h-4 w-4" /> Group QR
          </button>
          <button
            type="button"
            onClick={() => setMode("scan")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-display uppercase tracking-wider transition-all ${
              mode === "scan"
                ? "border-2 border-ink bg-grape text-white shadow-brutal-sm font-bold"
                : "text-ink/70 hover:text-ink"
            }`}
          >
            <Camera className="h-4 w-4" /> Quick Scanner
          </button>
        </div>

        {mode === "code" ? (
          <>
            {description && <p className="text-sm text-ink/70">{description}</p>}

            <div className="rounded-2xl border-3 border-ink bg-[#FFFDF5] p-5 shadow-brutal-md">
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
                aria-label="Group Invite Share URL"
              />
              <Button size="sm" variant="outline" onClick={handleCopy} aria-label="Copy Invite URL">
                {copied ? <Check className="h-4 w-4 text-mint" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={handleJoinFromScan} className="w-full space-y-4 text-left">
            <p className="text-sm text-ink/70 text-center">
              Paste or scan an invite QR code / link to join peer group instantly.
            </p>

            <div className="relative rounded-2xl border-3 border-dashed border-ink bg-butter/40 p-6 text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-paper shadow-brutal-sm">
                <Camera className="h-6 w-6 text-grape" />
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink/80">
                Camera QR Scanner Active
              </p>
              <p className="text-[11px] text-ink/60">
                Point camera at group QR code or paste Scanned payload below
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="qr-scan-input" className="text-xs font-display uppercase tracking-widest text-ink/70">
                Scanned QR Payload / Invite Link
              </label>
              <Input
                id="qr-scan-input"
                value={scanInput}
                onChange={(e) => {
                  setScanInput(e.target.value);
                  if (scanError) setScanError(null);
                }}
                placeholder="Paste scanned QR code URL or invite code..."
                className="font-mono text-xs"
              />
              {scanError && <p className="text-xs font-medium text-flamingo">{scanError}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={!scanInput.trim()}>
              Join Group Now <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </form>
        )}
      </div>
    </Dialog>
  );
}