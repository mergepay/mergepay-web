"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Users, ShieldAlert } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { logRenderError } from "@/lib/errorHandler";

interface Props {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, resetErrorBoundary: () => void) => ReactNode);
  onReset?: () => void;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * GroupErrorBoundary component following the bold neobrutalist design system.
 * Catches rendering errors, Stellar RPC disruptions, trustline failures, or invalid
 * balance payloads in group and settlement screens, rendering a high-contrast
 * fallback UI with a retry action button and clear diagnostic text.
 */
export class GroupErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logRenderError(error, { componentStack: errorInfo.componentStack });
    this.props.onError?.(error, errorInfo);
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

      const errorMessage = this.state.error.message || "An unexpected error occurred while hydrating group data or settlement views.";

      return (
        <Card className="mx-auto my-6 max-w-lg border-3 border-ink bg-butter shadow-brutal">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-3 border-ink bg-flamingo shadow-brutal-sm">
                <Users className="h-6 w-6 text-ink" />
              </div>
              <div>
                <h2 className="font-display text-lg uppercase tracking-tight text-ink">
                  Group Data Hydration Error
                </h2>
                <p className="text-xs text-ink/70">
                  Failed to load group expense and settlement details.
                </p>
              </div>
            </div>

            <div className="rounded-xl border-2 border-ink bg-white p-3 font-mono text-xs text-ink/80 overflow-auto max-h-32">
              {errorMessage}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <Button
                variant="primary"
                onClick={this.handleReset}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" /> Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
