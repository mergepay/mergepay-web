"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, LayoutDashboard, RefreshCw } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { logRenderError } from "@/lib/errorHandler";

interface Props {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, resetErrorBoundary: () => void) => ReactNode);
  onReset?: () => void;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Destination of the "Return to Dashboard" escape hatch. */
  dashboardHref?: string;
}

const DEFAULT_DASHBOARD_HREF = "/dashboard";

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
    // Structured and production-silent — the component stack of a crashed
    // group view is full of account data that has no business in a browser
    // console. Callers that need the raw error can subscribe via `onError`.
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

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              {/* Full document navigation on purpose: a crashed subtree should
                  come back through a clean reload rather than a soft client
                  transition that could re-enter the same broken state. */}
              <a
                href={this.props.dashboardHref ?? DEFAULT_DASHBOARD_HREF}
                className={buttonClassName("outline", "md")}
              >
                <LayoutDashboard className="h-4 w-4 mr-1" />
                Return to Dashboard
              </a>
              <Button onClick={this.handleReset} variant="primary">
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
