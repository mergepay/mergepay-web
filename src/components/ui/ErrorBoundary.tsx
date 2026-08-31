"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
 * ErrorBoundary component following the bold neobrutalist design system.
 * Catches rendering errors in child components and displays a fallback UI
 * with a retry/reset handler.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
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

      return (
        <Card className="mx-auto my-6 max-w-lg border-3 border-ink bg-flamingo-pale shadow-brutal">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-3 border-ink bg-flamingo shadow-brutal-sm">
                <AlertTriangle className="h-6 w-6 text-ink" />
              </div>
              <div>
                <h2 className="font-display text-lg uppercase tracking-tight text-ink">
                  Something went wrong
                </h2>
                <p className="text-xs text-ink/70">
                  An unexpected error occurred while rendering this component.
                </p>
              </div>
            </div>

            {process.env.NODE_ENV !== "production" && (
              <div className="rounded-xl border-2 border-ink bg-white p-3 font-mono text-xs text-ink/80 overflow-auto max-h-32">
                {this.state.error.message}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={this.handleReset} variant="default">
                <RefreshCw className="h-4 w-4 mr-1" />
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
