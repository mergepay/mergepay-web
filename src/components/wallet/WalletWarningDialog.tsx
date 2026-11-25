"use client";

import React, { useCallback } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Lock,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, buttonClassName } from "@/components/ui/button";
import { FREIGHTER_INSTALL_URL, NetworkMismatchError } from "@/lib/stellar";
import { EXPECTED_NETWORK_LABEL } from "@/lib/constants";
import type { WalletConnectionError } from "@/lib/auth-store";

export interface WalletWarningDialogProps {
  open: boolean;
  onClose: () => void;
  onRetry?: () => void | Promise<void>;
  error?: WalletConnectionError | Error | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  isRetrying?: boolean;
}

/**
 * Neobrutalist warning dialog displayed when Freighter wallet connection fails,
 * particularly for locked, unavailable/uninstalled, or timed-out extension states (#716).
 *
 * Utilizes the existing neobrutalist Dialog and Button primitives, with high-contrast
 * borders, brutalist drop-shadows, and an actionable "Retry Connection" workflow.
 */
export function WalletWarningDialog({
  open,
  onClose,
  onRetry,
  error,
  errorCode,
  errorMessage,
  isRetrying = false,
}: WalletWarningDialogProps) {
  const code = (
    errorCode ||
    (error && "code" in error ? (error as WalletConnectionError).code : undefined) ||
    "unknown"
  ).toLowerCase();
  const rawMessage = errorMessage || error?.message || "";

  const isLocked = code === "locked" || rawMessage.toLowerCase().includes("locked");
  const isNotInstalled =
    code === "not_installed" ||
    code === "unavailable" ||
    rawMessage.toLowerCase().includes("not found") ||
    rawMessage.toLowerCase().includes("not detected") ||
    rawMessage.toLowerCase().includes("install");
  const isTimeout =
    code === "timeout" ||
    rawMessage.toLowerCase().includes("timed out") ||
    rawMessage.toLowerCase().includes("timeout");
  const isRejected =
    code === "user_rejected" ||
    rawMessage.toLowerCase().includes("rejected") ||
    rawMessage.toLowerCase().includes("declined") ||
    rawMessage.toLowerCase().includes("cancelled");
  const isNetworkMismatch =
    code === "network_mismatch" || error instanceof NetworkMismatchError;

  // NetworkMismatchError carries both network names so the dialog can state
  // the problem and the fix; anything else falls back to the deployment's
  // expected network label.
  const mismatch =
    error instanceof NetworkMismatchError
      ? { wallet: error.walletNetwork, expected: error.expectedNetwork }
      : null;
  const expectedNetwork = mismatch?.expected ?? EXPECTED_NETWORK_LABEL;
  const walletNetwork = mismatch?.wallet ?? "a different network";

  let title = "Freighter Connection Failed";
  let description =
    rawMessage ||
    "Unable to establish a connection with your Freighter wallet. Please ensure the extension is active and try again.";
  let badgeToneClass = "bg-flamingo text-ink";
  let icon = <AlertTriangle className="h-6 w-6 text-ink" />;
  let showInstallAction = false;

  if (isLocked) {
    title = "Freighter Wallet Locked";
    description =
      "Your Freighter wallet is currently locked. Open the Freighter extension, enter your password to unlock it, and retry connection.";
    badgeToneClass = "bg-butter text-ink";
    icon = <Lock className="h-6 w-6 text-ink" />;
  } else if (isNotInstalled) {
    title = "Freighter Not Detected";
    description =
      "Freighter browser extension was not detected in this browser. Install Freighter from freighter.app to connect your Stellar wallet and continue.";
    badgeToneClass = "bg-flamingo text-ink";
    icon = <AlertTriangle className="h-6 w-6 text-ink" />;
    showInstallAction = true;
  } else if (isTimeout) {
    title = "Connection Timed Out";
    description =
      "The Freighter connection request timed out. This often happens when an extension prompt is ignored or multiple extension popups conflict. Check your extensions and retry.";
    badgeToneClass = "bg-butter text-ink";
    icon = <Clock className="h-6 w-6 text-ink" />;
  } else if (isRejected) {
    title = "Connection Request Declined";
    description =
      "The connection request was declined or cancelled in Freighter. To access your Mergepay account, please grant access when prompted.";
    badgeToneClass = "bg-tangerine text-ink";
    icon = <ShieldAlert className="h-6 w-6 text-ink" />;
  } else if (isNetworkMismatch) {
    title = "Wrong Stellar Network";
    description = `Your Freighter wallet is on ${walletNetwork}, but this app is set to ${expectedNetwork}. Open Freighter, switch the network to ${expectedNetwork}, then retry.`;
    badgeToneClass = "bg-butter text-ink";
    icon = <ArrowLeftRight className="h-6 w-6 text-ink" />;
  }

  const handleRetry = useCallback(async () => {
    if (onRetry) {
      await onRetry();
    }
  }, [onRetry]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      dismissible={!isRetrying}
      className="max-w-md border-3 border-ink bg-paper shadow-brutal-xl"
    >
      <div className="flex flex-col gap-5 pt-2" role="alert" data-testid="wallet-warning-dialog">
        <div className="flex items-start gap-4 rounded-xl border-2 border-ink bg-cream p-4 shadow-brutal-sm">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-ink shadow-brutal-sm ${badgeToneClass}`}
          >
            {icon}
          </div>
          <div className="space-y-1">
            <h3
              className="font-display text-sm font-bold uppercase tracking-wider text-ink"
              data-testid="wallet-warning-title"
            >
              {title}
            </h3>
            <p
              className="text-xs leading-relaxed text-ink/80"
              data-testid="wallet-warning-message"
            >
              {description}
            </p>
          </div>
        </div>

        {rawMessage && !isLocked && !isNotInstalled && !isNetworkMismatch && (
          <div className="rounded-lg border-2 border-ink bg-white/70 p-2.5 font-mono text-[11px] leading-tight text-ink/75 break-words">
            {rawMessage}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t-2 border-ink/10">
          {showInstallAction && (
            <a
              href={FREIGHTER_INSTALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClassName("secondary", "sm")}
              data-testid="install-freighter-button"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Install Freighter
            </a>
          )}

          {onRetry && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleRetry}
              loading={isRetrying}
              disabled={isRetrying}
              data-testid="retry-connection-button"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isRetrying ? "animate-spin" : ""}`} />
              Retry Connection
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isRetrying}
            data-testid="wallet-warning-dismiss"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
