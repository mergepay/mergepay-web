"use client";

/**
 * Receive-money QR modal (#328).
 *
 * "Generate" renders the connected Stellar public key as a scannable QR code
 * (long 56-character ed25519 keys are truncated for display but always encoded
 * in full — plus an optional transaction/URI payload such as a pay-request
 * URI). "Scan" accepts a scanned QR payload — a raw G… address or a URI —
 * validates it and offers a ready-to-copy result so a scanner can pay the
 * right destination.
 *
 * Feedback is never colour-only: the copy button swaps its icon to a check and
 * a sonner toast confirms the copy; failures surface an error toast instead of
 * a fake "copied" state (matches the ShareAddressModal / CopyButton pattern).
 */

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, QrCode, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StrKey } from "@/lib/strkey";
import { cn } from "@/lib/utils";

export type ReceiveQrMode = "generate" | "scan";

export interface ReceiveQrModalProps {
  open: boolean;
  onClose: () => void;
  /** Full (untruncated) Stellar public key — always encoded whole in the QR. */
  stellarPublicKey: string;
  /** Optional pre-encoded payload, e.g. a web+stellar: transaction URI. */
  transactionUri?: string;
  /** Initial tab when the modal opens. */
  initialMode?: ReceiveQrMode;
  displayName?: string;
}

/** Long keys stay scannable in the text readout without breaking layout. */
function truncateForDisplay(value: string, chars = 8): string {
  if (value.length <= chars * 2) return value;
  return `${value.slice(0, chars)}…${value.slice(-chars)}`;
}

/**
 * Classify a scanned payload and extract a copyable pay target.
 *
 * Returns `ok: false` for anything that is neither a valid ed25519 public key
 * nor a URI, so garbage QR payloads never reach the copy button.
 */
export function parseScannedPayload(raw: string):
  | { ok: true; kind: "address" | "uri"; value: string; display: string }
  | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "Paste or scan a QR payload first." };

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return {
      ok: true,
      kind: "uri",
      value: trimmed,
      display: truncateForDisplay(trimmed, 24),
    };
  }

  if (StrKey.isValidEd25519PublicKey(trimmed)) {
    return {
      ok: true,
      kind: "address",
      value: trimmed,
      display: truncateForDisplay(trimmed, 8),
    };
  }

  return {
    ok: false,
    reason:
      "Not a valid Stellar address or payment URI. Check the QR code and try again.",
  };
}

export function ReceiveQrModal({
  open,
  onClose,
  stellarPublicKey,
  transactionUri,
  initialMode = "generate",
  displayName,
}: ReceiveQrModalProps) {
  const [mode, setMode] = useState<ReceiveQrMode>(initialMode);
  const [copied, setCopied] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<{
    kind: "address" | "uri";
    value: string;
    display: string;
  } | null>(null);

  // Keep internal tab/reset state in sync when the modal is re-opened or the
  // desired entry tab changes while mounted.
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setCopied(false);
      setScanInput("");
      setScanError(null);
      setScanned(null);
    }
  }, [open, initialMode]);

  const encodedValue = useMemo(
    () => transactionUri?.trim() || stellarPublicKey,
    [transactionUri, stellarPublicKey]
  );

  async function handleCopy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${what} copied`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be denied (insecure origin / permission policy) — never
      // pretend it worked.
      toast.error(`Could not copy the ${what}. Select and copy it manually.`);
    }
  }

  function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseScannedPayload(scanInput);
    if (!parsed.ok) {
      setScanError(parsed.reason);
      setScanned(null);
      toast.error(parsed.reason);
      return;
    }
    setScanError(null);
    setScanned({ kind: parsed.kind, value: parsed.value, display: parsed.display });
    toast.success(
      parsed.kind === "address"
        ? "Valid Stellar address detected"
        : "Valid payment URI detected"
    );
  }

  const qrSize = 200;
  const qrFg = "#18130E";
  const qrBg = "#FFFDF5";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Receive Money"
      description="Show this QR code to request funds instantly, or scan a pay request."
    >
      <div className="flex flex-col items-center space-y-4 p-2 text-center">
        {/* Mode selector — mirrors ShareQrModal's brutal pill toggle. */}
        <div className="flex w-full gap-2 rounded-xl border-2 border-ink bg-cream p-1">
          <button
            type="button"
            onClick={() => setMode("generate")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-display text-xs uppercase tracking-wider transition-all",
              mode === "generate"
                ? "border-2 border-ink bg-grape font-bold text-white shadow-brutal-sm"
                : "text-ink/70 hover:text-ink"
            )}
          >
            <QrCode className="h-4 w-4" /> Generate
          </button>
          <button
            type="button"
            onClick={() => setMode("scan")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-display text-xs uppercase tracking-wider transition-all",
              mode === "scan"
                ? "border-2 border-ink bg-grape font-bold text-white shadow-brutal-sm"
                : "text-ink/70 hover:text-ink"
            )}
          >
            <ScanLine className="h-4 w-4" /> Scan
          </button>
        </div>

        {mode === "generate" ? (
          <>
            {displayName && (
              <p className="text-sm text-ink/70">
                Show your QR code so <span className="font-bold text-ink">{displayName}</span> can pay you.
              </p>
            )}

            <div className="w-full max-w-[260px] rounded-2xl border-3 border-ink bg-[#FFFDF5] p-5 shadow-brutal-md">
              <QRCodeSVG
                value={encodedValue}
                size={qrSize}
                level="M"
                marginSize={2}
                fgColor={qrFg}
                bgColor={qrBg}
              />
            </div>

            <div className="w-full space-y-1.5">
              <label
                htmlFor="receive-payload-input"
                className="font-display text-xs uppercase tracking-widest text-ink/70"
              >
                {transactionUri ? "Transaction URI" : "Your Stellar Public Key"}
              </label>
              <div className="flex items-center gap-2">
                <div
                  id="receive-payload-input"
                  className="flex-1 truncate rounded-xl border-2 border-ink bg-paper px-3 py-2 font-mono text-xs select-all"
                >
                  {truncateForDisplay(encodedValue, 8)}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void handleCopy(encodedValue, transactionUri ? "Transaction URI" : "Stellar address")
                  }
                  aria-label={
                    copied
                      ? transactionUri
                        ? "Transaction URI copied"
                        : "Stellar address copied"
                      : transactionUri
                        ? "Copy transaction URI to clipboard"
                        : "Copy Stellar address to clipboard"
                  }
                  className={cn("transition-colors", copied && "bg-lime text-ink")}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex w-full items-center gap-2 rounded-xl border-2 border-ink bg-butter/40 p-3 text-left">
              <QrCode className="h-4 w-4 shrink-0 text-ink" />
              <p className="text-xs text-ink/70">
                The QR code always encodes your full {transactionUri ? "transaction URI" : "public key"} —
                the shortened text above is display-only.
              </p>
            </div>
          </>
        ) : (
          <form onSubmit={handleScanSubmit} className="w-full space-y-4 text-left">
            <div className="rounded-2xl border-3 border-dashed border-ink bg-butter/40 p-6 text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-paper shadow-brutal-sm">
                <ScanLine className="h-6 w-6 text-grape" />
              </div>
              <p className="font-display text-xs font-bold uppercase tracking-wider text-ink/80">
                Point your camera at a Mergepay or Stellar QR code
              </p>
              <p className="text-[11px] text-ink/60">
                Or paste the scanned payload below — raw G… address or payment URI.
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="receive-scan-input"
                className="font-display text-xs uppercase tracking-widest text-ink/70"
              >
                Scanned QR Payload
              </label>
              <Input
                id="receive-scan-input"
                value={scanInput}
                onChange={(e) => {
                  setScanInput(e.target.value);
                  if (scanError) setScanError(null);
                }}
                placeholder="GABC… or web+stellar:pay?destination=…"
                className="font-mono text-xs"
                aria-invalid={scanError ? true : undefined}
              />
              {scanError && (
                <p role="alert" className="text-xs font-medium text-flamingo">
                  {scanError}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={!scanInput.trim()}>
              Validate Payload
            </Button>

            {scanned && (
              <div className="w-full space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 truncate rounded-xl border-2 border-ink bg-paper px-3 py-2 font-mono text-xs select-all">
                    {scanned.display}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void handleCopy(
                        scanned.value,
                        scanned.kind === "address" ? "Scanned address" : "Scanned payment URI"
                      )
                    }
                    aria-label={
                      copied
                        ? scanned.kind === "address"
                          ? "Scanned address copied"
                          : "Scanned payment URI copied"
                        : scanned.kind === "address"
                          ? "Copy scanned Stellar address to clipboard"
                          : "Copy scanned payment URI to clipboard"
                    }
                    className={cn("transition-colors", copied && "bg-lime text-ink")}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-[11px] text-ink/60">
                  Validated {scanned.kind === "address" ? "Stellar address" : "payment URI"} —
                  copy it into the send flow.
                </p>
              </div>
            )}
          </form>
        )}
      </div>
    </Dialog>
  );
}
