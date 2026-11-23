"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, LayoutDashboard, RefreshCw, RotateCcw, ChevronDown } from "lucide-react";
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
  showDetails: boolean;
  retryCount: number;
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
    showDetails: false,
    retryCount: 0,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, showDetails: false };
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
    this.setState((previous) => ({ hasError: false, error: null, showDetails: false, retryCount: previous.retryCount + 1 }));
  };

  /**
   * Full document reload. `Try Again` re-renders the subtree, which is right
   * when the failure was transient (a rejected wallet call, a bad response),
   * but a crash caused by module or provider state survives that remount. The
   * reload path guarantees the user is never stuck on the fallback.
   */
  private handleReload = () => {
    window.location.reload();
  };

  private toggleDetails = () => {
    this.setState((previous) => ({ showDetails: !previous.showDetails }));
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

            <div className="space-y-2">
              <Button type="button" variant="outline" onClick={this.toggleDetails}
                aria-expanded={this.state.showDetails} aria-controls="mergepay-error-details">
                <ChevronDown className="mr-1 h-4 w-4" aria-hidden="true" />
                {this.state.showDetails ? "Hide error details" : "Show error details"}
              </Button>
              {this.state.showDetails && (
                <div id="mergepay-error-details" role="status"
                  className="max-h-40 overflow-auto break-words rounded-xl border-2 border-ink bg-white p-3 font-mono text-xs text-ink/80">
                  {process.env.NODE_ENV === "production"
                    ? "An unexpected rendering error occurred. Reload the page if retrying does not help."
                    : `${this.state.error.name}: ${this.state.error.message}`}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              {/* Full document navigation on purpose: a crashed subtree should
                  come back through a clean reload rather than a soft client
                  transition that could re-enter the same broken state. */}
              <a
                href={this.props.dashboardHref ?? DEFAULT_DASHBOARD_HREF}
                className={buttonClassName("outline", "md")}
                aria-label="Return to dashboard"
              >
                <LayoutDashboard className="h-4 w-4 mr-1" />
                Return to Dashboard
              </a>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={this.handleReload} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Reload page
                </Button>
                <Button onClick={this.handleReset} variant="primary" disabled={this.state.retryCount >= 2}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  {this.state.retryCount >= 2 ? "Reload to recover" : "Try Again"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
