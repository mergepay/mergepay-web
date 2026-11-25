"use client";

import React, { useState, useCallback } from "react";
import { Wallet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useAuth as useAuthStore, type WalletConnectionError } from "@/lib/auth-store";
import { isFreighterAvailable, WalletError, WalletNotInstalledError } from "@/lib/stellar";
import { WalletWarningDialog } from "./WalletWarningDialog";

export interface WalletConnectionProps {
  onConnect?: () => Promise<void> | void;
  className?: string;
  variant?: "primary" | "secondary" | "lime" | "outline";
  size?: "sm" | "md" | "lg";
}

/**
 * Neobrutalist wallet connection trigger with robust error handling,
 * Freighter availability detection, and retry dialog integration (#716).
 */
export function WalletConnection({
  onConnect,
  className = "",
  variant = "primary",
  size = "md",
}: WalletConnectionProps) {
  const { login } = useAuth();
  const walletError = useAuthStore((s) => s.walletError);
  const setWalletError = useAuthStore((s) => s.setWalletError);
  const clearWalletError = useAuthStore((s) => s.clearWalletError);

  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Detect if Freighter extension is installed before invoking connection hooks
      const available = await isFreighterAvailable();
      if (!available) {
        const notInstalledErr: WalletConnectionError = {
          code: "not_installed",
          message: "Freighter browser extension was not detected in this browser.",
        };
        setWalletError(notInstalledErr);
        setDialogOpen(true);
        return;
      }

      clearWalletError();

      if (onConnect) {
        await onConnect();
      } else {
        await login();
      }
      setDialogOpen(false);
    } catch (e) {
      setDialogOpen(true);
      if (e instanceof WalletError) {
        setWalletError({
          code: e.code,
          message: e.message,
        });
      } else if (e instanceof Error) {
        setWalletError({
          code: "unknown",
          message: e.message,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [clearWalletError, login, onConnect, setWalletError]);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    clearWalletError();
  }, [clearWalletError]);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={connect}
        disabled={loading}
        className={className}
        data-testid="wallet-connection-trigger"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <Wallet className="mr-2 h-4 w-4" />
            Connect Freighter
          </>
        )}
      </Button>

      <WalletWarningDialog
        open={dialogOpen || Boolean(walletError)}
        error={walletError}
        onClose={handleCloseDialog}
        onRetry={connect}
        isRetrying={loading}
      />
    </>
  );
}
