"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface WalletErrorFallbackProps {
  error: Error | null;
  onRetry?: () => void;
  className?: string;
}

/**
 * Neobrutalist wallet error fallback component (#700).
 * Displays actionable recovery instructions for Freighter/Stellar connection failures.
 */
export function WalletErrorFallback({ error, onRetry, className = "" }: WalletErrorFallbackProps) {
  const isRejected =
    error?.message?.toLowerCase().includes("user declined") ||
    error?.message?.toLowerCase().includes("rejected");
  const isMissing =
    error?.message?.toLowerCase().includes("freighter not found") ||
    error?.message?.toLowerCase().includes("install");

  return (
    <Card className={`mx-auto my-4 max-w-md border-3 border-ink bg-flamingo-pale shadow-brutal ${className}`}>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-3 border-ink bg-flamingo shadow-brutal-sm">
            <Wallet className="h-5 w-5 text-ink" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold uppercase tracking-tight text-ink">
              Wallet Connection Failed
            </h3>
            <p className="text-xs text-ink/80">
              {isRejected
                ? "Connection request was rejected in your wallet."
                : isMissing
                ? "Freighter extension was not detected."
                : "Unable to establish connection with Stellar wallet."}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border-2 border-ink bg-white p-2.5 font-mono text-xs text-ink/90">
            {error.message}
          </div>
        )}

        {onRetry && (
          <div className="flex justify-end pt-1">
            <Button onClick={onRetry} variant="primary" size="sm">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Reconnect Wallet
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface WalletErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, retry: () => void) => ReactNode);
  onReset?: () => void;
}

interface WalletErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class WalletErrorBoundary extends Component<WalletErrorBoundaryProps, WalletErrorBoundaryState> {
  public state: WalletErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): WalletErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("WalletErrorBoundary caught an error:", error, errorInfo);
  }

  private handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === "function") {
          return this.props.fallback(this.state.error, this.handleReset);
        }
        return this.props.fallback;
      }
      return <WalletErrorFallback error={this.state.error} onRetry={this.handleReset} />;
    }
    return this.props.children;
  }
}
