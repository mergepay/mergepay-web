"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint } from "@/components/ui/input";
import { Camera, CameraOff, Copy, AlertTriangle, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface GroupQRScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScanResult: (result: string) => void;
  title?: string;
  description?: string;
}

export function GroupQRScannerModal({
  open,
  onClose,
  onScanResult,
  title = "Scan QR Code / Group Invite",
  description = "Use your camera to scan a group invite or Stellar public key QR code, or paste the link manually below.",
}: GroupQRScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API not supported in this browser");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHasCameraPermission(true);
      setIsScanning(true);
    } catch (err) {
      console.error("Camera permission error:", err);
      setHasCameraPermission(false);
      setCameraError("Camera access denied or unavailable. Please use manual fallback below.");
      stopCamera();
    }
  }, [stopCamera]);

  useEffect(() => {
    if (open) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open, startCamera, stopCamera]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) {
      toast.error("Please enter a valid invite link or address");
      return;
    }
    onScanResult(manualInput.trim());
    setManualInput("");
    onClose();
  };

  const handleCopyClipboardFallback = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setManualInput(text);
        toast.success("Pasted from clipboard successfully");
      }
    } catch {
      toast.error("Failed to read clipboard automatically. Please paste manually.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title={title}
      description={description}
      className="sm:max-w-md"
    >
      <div className="flex flex-col space-y-4 p-2">
        {hasCameraPermission === false || cameraError ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-3 border-ink bg-amber-50 p-6 text-center shadow-brutal space-y-3">
            <AlertTriangle className="h-8 w-8 text-amber-700" />
            <p className="font-display text-sm uppercase tracking-wider text-ink">
              Camera Unavailable
            </p>
            <p className="text-xs text-ink/80">
              {cameraError || "Camera permission was denied or is not supported."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={startCamera}
              className="mt-2"
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Try Again
            </Button>
          </div>
        ) : (
          <div className="relative flex flex-col items-center justify-center rounded-2xl border-3 border-ink bg-ink overflow-hidden shadow-brutal aspect-square max-h-[280px]">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
            />
            {!isScanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-ink/70 text-white font-display text-xs uppercase tracking-widest">
                Initializing Camera...
              </div>
            )}
            <div className="absolute bottom-3 rounded-full bg-ink/80 px-3 py-1 text-[10px] font-display uppercase tracking-widest text-white border border-white/20">
              Position QR code in frame
            </div>
          </div>
        )}

        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="manual-scan-input">Manual Fallback Input</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopyClipboardFallback}
              className="text-xs h-7 px-2"
            >
              <Copy className="h-3.5 w-3.5 mr-1" /> Paste Clipboard
            </Button>
          </div>
          <form onSubmit={handleManualSubmit} className="flex items-center gap-2">
            <Input
              id="manual-scan-input"
              placeholder="Paste invite URL or public key..."
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              className="font-mono text-xs"
            />
            <Button type="submit" size="sm">
              Submit
            </Button>
          </form>
          <FieldHint>
            If scanning fails, copy the invite link or public key and paste it above.
          </FieldHint>
        </div>
      </div>
    </Dialog>
  );
}
