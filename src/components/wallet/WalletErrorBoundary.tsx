"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { ShieldAlert, RefreshCcw, ExternalLink, WifiOff, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FREIGHTER_INSTALL_URL, WalletError, WalletLockedError, WalletNotInstalledError, UserRejectedError, WalletDisconnectedError, WalletNetworkError } from "@/lib/stellar";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  subject?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Robust React Error Boundary specifically tailored for Stellar wallet flows
 * (@stellar/freighter-api failures, locked states, uninstalled extension, network errors).
 * 
 * Renders a high-contrast neobrutalist fallback card with clear recovery actions
 * ('Try Again', 'Install Freighter') and logs errors safely without leaking sensitive keys.
 */
export class WalletErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error safely without leaking key material or private state
    const safeName = error.name || "WalletError";
    const safeMsg = error.message || "Unknown wallet error";
    console.error(`[WalletErrorBoundary] Caught wallet error (${safeName}):`, safeMsg, errorInfo.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const err = this.state.error;
      const code = err instanceof WalletError ? err.code : "unknown";
      const subject = this.props.subject || "wallet connection";

      let title = "Wallet Connection Error";
      let description = err?.message || `An unexpected error occurred during ${subject}.`;
      let icon = <ShieldAlert className="h-6 w-6" />;
      let showInstallLink = false;

      if (code === "not_installed" || err instanceof WalletNotInstalledError) {
        title = "Freighter Not Detected";
        description = "Freighter browser extension is not installed or available. Please install Freighter to connect your Stellar wallet.";
        icon = <AlertTriangle className="h-6 w-6" />;
        showInstallLink = true;
      } else if (code === "locked" || err instanceof WalletLockedError) {
        title = "Wallet Locked";
        description = "Your Freighter wallet is locked. Please open the extension and enter your password to unlock.";
        icon = <WifiOff className="h-6 w-6" />;
      } else if (code === "user_rejected" || err instanceof UserRejectedError) {
        title = "Request Cancelled";
        description = "The connection or signature request was cancelled or rejected in Freighter.";
        icon = <RefreshCcw className="h-6 w-6" />;
      } else if (code === "disconnected" || err instanceof WalletDisconnectedError) {
        title = "Wallet Disconnected";
        description = "Your Stellar wallet connection was lost or the active account changed. Please reconnect.";
        icon = <WifiOff className="h-6 w-6" />;
      } else if (code === "network" || err instanceof WalletNetworkError) {
        title = "Network Connection Error";
        description = "Could not reach the Stellar network or Freighter extension. Check your internet connection.";
        icon = <WifiOff className="h-6 w-6" />;
      }

      return (
        <div
          role="alert"
          className="my-4 rounded-2xl border-3 border-ink bg-butter p-6 shadow-brutal"
        >
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-3 border-ink bg-tangerine text-ink shadow-brutal-sm">
              {icon}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <h3 className="font-display text-base font-bold uppercase tracking-wide text-ink">
                {title}
              </h3>
              <p className="text-xs font-medium leading-relaxed text-ink/80 sm:text-sm">
                {description}
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  onClick={this.handleReset}
                  className="border-2 border-ink bg-cream font-bold shadow-brutal-sm hover:bg-paper"
                >
                  <RefreshCcw className="h-4 w-4 mr-1.5" /> Try Again
                </Button>

                {showInstallLink && (
                  <a
                    href={FREIGHTER_INSTALL_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border-2 border-ink bg-grape px-4 py-2.5 text-xs font-bold text-cream shadow-brutal-sm hover:bg-grape/90 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" /> Install Freighter
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
