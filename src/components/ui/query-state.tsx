"use client";

import { type ReactNode } from "react";
import { AlertTriangle, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "./button";
import { Badge } from "./badge";
import { Skeleton } from "./skeleton";
import { cn } from "@/lib/utils";

/**
 * Recoverable failure panel.
 *
 * Retry re-runs the query in place — the user never has to reload the page.
 * The copy comes from the caller; raw server responses are not rendered.
 */
export function QueryErrorState({
  title,
  description,
  onRetry,
  retrying,
  icon,
}: {
  title: string;
  description: string;
  onRetry: () => void;
  retrying?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border-3 border-ink bg-flamingo-pale px-6 py-8 text-center shadow-brutal"
      role="alert"
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border-3 border-ink bg-cream shadow-brutal-sm">
        {icon ?? <AlertTriangle className="h-6 w-6" />}
      </div>
      <h3 className="font-display text-lg uppercase tracking-tight">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink/70">{description}</p>
      <div className="mt-5 flex justify-center">
        <Button variant="outline" onClick={onRetry} loading={retrying}>
          <RefreshCcw className="h-4 w-4" /> Try again
        </Button>
      </div>
    </div>
  );
}

/**
 * Inline banner shown above data that is on screen despite the latest refresh
 * failing, so the user knows it may be out of date but does not lose it.
 */
export function StaleDataNotice({
  onRetry,
  retrying,
  children,
}: {
  onRetry: () => void;
  retrying?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-ink bg-butter-pale px-4 py-2.5 text-sm"
      role="status"
    >
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {children}
      </span>
      <Button size="sm" variant="outline" onClick={onRetry} loading={retrying}>
        <RefreshCcw className="h-3.5 w-3.5" /> Retry
      </Button>
    </div>
  );
}

/**
 * Quiet indicator for a background refetch. Existing content stays put; only
 * this badge appears, so a refresh never looks like a reload.
 */
export function RefreshingBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Badge tone="paper" aria-live="polite">
      <Loader2 className="h-3 w-3 animate-spin" /> Refreshing
    </Badge>
  );
}

/**
 * A statistic that refuses to render a number it does not have.
 *
 * Pass `value: null` whenever the underlying query has not produced
 * trustworthy data, and the tile shows a placeholder instead of a zero.
 */
export function StatValue({
  value,
  unavailableLabel = "Not available yet",
  className,
}: {
  value: string | null;
  unavailableLabel?: string;
  className?: string;
}) {
  if (value === null) {
    return (
      <span className="flex items-center" aria-label={unavailableLabel}>
        <Skeleton className="h-8 w-24" />
      </span>
    );
  }
  return (
    <span className={cn("font-mono text-3xl font-bold tabular-nums", className)}>
      {value}
    </span>
  );
}
