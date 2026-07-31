"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { describeSectionError } from "@/lib/sectionState";

/**
 * Local failure state for one dashboard section.
 *
 * Rendered in place of that section only, so the rest of the page keeps
 * working. The retry control is a real button — reachable and operable by
 * keyboard — and refetches just this section's query.
 */
export function SectionError({
  subject,
  error,
  onRetry,
  className,
}: {
  /** What failed to load, e.g. "your groups". Used in the copy. */
  subject: string;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const copy = describeSectionError(error, subject);
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex flex-wrap items-start gap-3" role="alert">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-flamingo">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="min-w-[12rem] flex-1">
          <h3 className="font-display text-base uppercase tracking-tight">
            {copy.title}
          </h3>
          <p className="mt-1 text-sm text-ink/60">{copy.description}</p>
        </div>
        {copy.retryable && onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" /> Retry
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * Loading placeholder that reserves the section's height, so a section
 * resolving later does not shove the rest of the layout around.
 */
export function SectionLoading({
  label,
  minHeight = "min-h-[8rem]",
  className,
  children,
}: {
  /** Announced while the section loads. */
  label: string;
  minHeight?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn(minHeight, className)}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

interface BoundaryProps {
  /** What this boundary protects, e.g. "the balances panel". */
  subject: string;
  children: ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

/**
 * Contains an unexpected rendering error inside one section.
 *
 * Without this, a throw while rendering a single panel unmounts the whole
 * authenticated tree up to the route-level boundary and blanks the page.
 * The fallback deliberately shows no error details: the message may carry
 * internals or request data. The real error still reaches the console for
 * local debugging.
 */
export class SectionBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error(`[mergepay] ${this.props.subject} failed to render`, error, info);
    }
  }

  private reset = () => this.setState({ failed: false });

  render() {
    if (this.state.failed) {
      return (
        <Card className="p-5">
          <div className="flex flex-wrap items-start gap-3" role="alert">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-flamingo">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-[12rem] flex-1">
              <h3 className="font-display text-base uppercase tracking-tight">
                Could not display this section
              </h3>
              <p className="mt-1 text-sm text-ink/60">
                Something went wrong showing {this.props.subject}. The rest of
                the page still works.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={this.reset}>
              <RotateCcw className="h-3.5 w-3.5" /> Try again
            </Button>
          </div>
        </Card>
      );
    }
    return this.props.children;
  }
}
