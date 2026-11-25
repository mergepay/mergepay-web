"use client";

import { useState, useMemo, useEffect, useId } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useGroupActivityPolling } from "@/hooks/useGroupActivityPolling";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AssetBadge } from "@/components/asset-badge";
import { Money } from "@/components/amount";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton, ActivityFeedSkeleton } from "@/components/ui/skeleton";
import { SectionBoundary, SectionError, SectionLoading } from "@/components/ui/section";
import { ExpenseFilterBar, type ActivityFilters } from "@/components/expenses/ExpenseFilterBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  activityFiltersFromSearchParams,
  activityFiltersToSearchParams,
  activityMemo,
  countActiveActivityFilters,
  filterActivityEvents,
  type ActivityFeedFilters,
} from "@/lib/activityFilters";
import {
  Activity,
  CheckCircle2,
  Clock,
  FilterX,
  Loader2,
  PlusCircle,
  Radio,
  SearchX,
  Tag,
  Trash2,
  UserPlus,
} from "lucide-react";
import type { GroupActivityEvent, GroupActivityType } from "@/lib/types";

export interface GroupActivityFeedProps {
  groupId: string;
  className?: string;
  /** When true, polls for activity at a configurable interval. */
  polling?: boolean;
  /** Polling interval in ms (default 15 000). Ignored when polling is false. */
  pollingIntervalMs?: number;
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "recently";

    const diffSecs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSecs < 10) return "just now";
    if (diffSecs < 60) return `${diffSecs}s ago`;

    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "recently";
  }
}

function getActivityConfig(type: GroupActivityType) {
  switch (type) {
    case "expense_created":
      return {
        icon: <PlusCircle className="h-4 w-4 text-lime-dark" />,
        badgeTone: "lime" as const,
        label: "Expense Added",
      };
    case "payment_settled":
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-mint-dark" />,
        badgeTone: "aqua" as const,
        label: "Payment Settled",
      };
    case "member_joined":
      return {
        icon: <UserPlus className="h-4 w-4 text-butter-dark" />,
        badgeTone: "butter" as const,
        label: "Member Joined",
      };
    case "expense_deleted":
      return {
        icon: <Trash2 className="h-4 w-4 text-tangerine-dark" />,
        badgeTone: "tangerine" as const,
        label: "Expense Deleted",
      };
    default:
      return {
        icon: <Activity className="h-4 w-4 text-ink" />,
        badgeTone: "paper" as const,
        label: "Activity",
      };
  }
}

function ActivityList({
  activities,
  totalCount,
  activeFilterCount,
  onResetFilters,
  onFilterByMemo,
}: {
  activities: GroupActivityEvent[];
  /** Events before filtering — tells "nothing yet" apart from "nothing matches". */
  totalCount: number;
  activeFilterCount: number;
  onResetFilters: () => void;
  onFilterByMemo: (memo: string) => void;
}) {
  if (activities.length === 0) {
    if (totalCount === 0 || activeFilterCount === 0) {
      return (
        <EmptyState
          icon={<Activity className="h-7 w-7" />}
          title="No activity yet"
          description="Expenses, settlements and new members will show up here as they happen."
        />
      );
    }
    return (
      <div data-testid="activity-empty-filtered">
        <EmptyState
          icon={<SearchX className="h-7 w-7" />}
          title="No matching activity found"
          description={`None of the ${totalCount} ${totalCount === 1 ? "event" : "events"} in this group match your ${
            activeFilterCount === 1 ? "filter" : `${activeFilterCount} filters`
          }. Try a broader search, or clear the filters to see everything.`}
          action={
            <Button variant="outline" onClick={onResetFilters} data-testid="activity-reset-filters">
              <FilterX className="h-4 w-4" aria-hidden="true" /> Clear all filters
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3" aria-label="Group activity events">
        {activities.map((event: GroupActivityEvent) => (
          <ActivityItem key={event.id} event={event} onFilterByMemo={onFilterByMemo} />
        ))}
      </ul>
    </div>
  );
}

const fieldLabel = "mb-1 block font-display text-xs uppercase tracking-widest text-ink";

/** Memo-tag search and event-type toggles, rendered inside the shared filter bar. */
function ActivityExtraFilters({
  filters,
  onChange,
}: {
  filters: ActivityFeedFilters;
  onChange: (patch: Partial<ActivityFeedFilters>) => void;
}) {
  const id = useId();
  const selected = filters.types ?? [];
  const toggle = (type: GroupActivityType) => {
    const next = selected.includes(type) ? selected.filter((t) => t !== type) : [...selected, type];
    onChange({ types: next.length > 0 ? next : undefined });
  };

  return (
    <>
      <div className="min-w-0">
        <label htmlFor={`${id}-memo`} className={fieldLabel}>
          Memo tag
        </label>
        <Input
          id={`${id}-memo`}
          aria-label="Filter by memo tag"
          placeholder="MP:dinner…"
          className="font-mono"
          value={filters.memo ?? ""}
          onChange={(e) => onChange({ memo: e.target.value || undefined })}
        />
      </div>
      <div className="min-w-0 min-[420px]:col-span-2 lg:col-span-4">
        <span className={fieldLabel} id={`${id}-types`}>
          Event type
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-types`}>
          {ACTIVITY_TYPES.map((type) => {
            const pressed = selected.includes(type);
            return (
              <button
                key={type}
                type="button"
                aria-pressed={pressed}
                onClick={() => toggle(type)}
                className={cn(
                  "rounded-lg border-2 px-3 py-1.5 font-display text-xs uppercase tracking-wider transition-all duration-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40",
                  pressed
                    ? "border-ink bg-grape text-white shadow-brutal-sm"
                    : "border-ink/20 bg-cream text-ink/70 hover:border-ink hover:text-ink"
                )}
              >
                {ACTIVITY_TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function PollingIndicator({
  isPolling,
  pollingStalled,
}: {
  isPolling: boolean;
  pollingStalled: boolean;
}) {
  if (pollingStalled) {
    return (
      <Badge tone="tangerine" className="text-[10px] px-2 py-0.5">
        <Clock className="h-3 w-3 mr-1" />
        Polling paused
      </Badge>
    );
  }

  if (isPolling) {
    return (
      <Badge tone="aqua" className="text-[10px] px-2 py-0.5">
        <Radio className="h-3 w-3 mr-1 animate-pulse" />
        Live
      </Badge>
    );
  }

  return null;
}

export function GroupActivityFeed({
  groupId,
  className = "",
  polling = false,
  pollingIntervalMs,
}: GroupActivityFeedProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [filters, setFilters] = useState<ActivityFeedFilters>(() =>
    activityFiltersFromSearchParams(searchParams)
  );

  // Mirror the filters into the URL so a filtered view can be shared as a
  // link. Unrelated query params are kept, and the URL is only replaced when
  // it would actually change.
  const currentQuery = searchParams.toString();
  useEffect(() => {
    const next = activityFiltersToSearchParams(filters, currentQuery);
    if (next === currentQuery) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [filters, currentQuery, pathname, router]);

  const resetFilters = () => setFilters({});
  const activeFilterCount = countActiveActivityFilters(filters);
  const extraActiveCount = (filters.memo?.trim() ? 1 : 0) + (filters.types?.length ? 1 : 0);

  const options = polling
    ? { intervalMs: pollingIntervalMs ?? 15_000, enabled: true }
    : { intervalMs: false as const, enabled: true };

  const pollingResult = useGroupActivityPolling(groupId, options);

  const {
    activities: rawActivities,
    isLoading,
    isError,
    error,
    refetch,
    isPolling: live,
    pollingStalled,
  } = pollingResult;

  // Filter client-side, recomputed only when the events or filters change.
  const activities = useMemo(
    () => filterActivityEvents(rawActivities, filters),
    [rawActivities, filters]
  );

  return (
    <SectionBoundary subject="the activity feed">
      <div className={className}>
        {isLoading && (
          <SectionLoading label="Loading group activity feed" minHeight="min-h-[16rem]">
            <ActivityFeedSkeleton rows={4} />
          </SectionLoading>
        )}

        {isError && (
          <SectionError
            subject="the activity feed for this group"
            error={error}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3
                className="font-display text-sm uppercase tracking-widest text-ink/60"
                aria-live="polite"
                data-testid="activity-count"
              >
                Activity Feed ({activities.length}{rawActivities.length !== activities.length ? ` of ${rawActivities.length}` : ""})
              </h3>
              {polling && <PollingIndicator isPolling={live} pollingStalled={pollingStalled} />}
            </div>

            <ExpenseFilterBar
              value={filters}
              // The shared bar owns the common fields; memo and type live in
              // the extras below and survive its edits.
              onChange={(next: ActivityFilters) =>
                setFilters((prev) => ({ ...next, memo: prev.memo, types: prev.types }))
              }
              searchLabel="Search activity by memo or participant"
              searchPlaceholder="Search description, member, memo or amount…"
              extraActiveCount={extraActiveCount}
              onClearExtras={resetFilters}
            >
              <ActivityExtraFilters
                filters={filters}
                onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
              />
            </ExpenseFilterBar>

            <ActivityList
              activities={activities}
              totalCount={rawActivities.length}
              activeFilterCount={activeFilterCount}
              onResetFilters={resetFilters}
              onFilterByMemo={(memo) => setFilters((prev) => ({ ...prev, memo }))}
            />
          </>
        )}
      </div>
    </SectionBoundary>
  );
}

function ActivityItem({
  event,
  onFilterByMemo,
}: {
  event: GroupActivityEvent;
  onFilterByMemo: (memo: string) => void;
}) {
  const config = getActivityConfig(event.type);
  const memo = activityMemo(event);
  const isOptimistic = Boolean(event.isOptimistic);
  const isPending = ["pending", "submitted", "settling"].includes(event.status ?? "");

  return (
    <li
      className={`relative flex items-start gap-3 rounded-xl border-3 border-ink p-4 transition-all duration-150 ${
        isOptimistic
          ? "bg-butter-pale shadow-brutal-sm animate-pulse border-dashed"
          : "bg-cream shadow-brutal hover:-translate-y-0.5"
      }`}
    >
      <Avatar
        user={{
          displayName: event.actor.displayName,
          stellarPublicKey: event.actor.id,
          avatarUrl: event.actor.avatarUrl,
        }}
        size="md"
        className="mt-0.5 border-2 border-ink shrink-0"
      />

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-ink tracking-tight">
              {event.actor.displayName}
            </span>
            <Badge tone={config.badgeTone} className="text-[10px] px-2 py-0.5">
              <span className="mr-1 inline-block">{config.icon}</span>
              {config.label}
            </Badge>

            {isPending && (
              <Badge tone="butter" className="text-[10px] px-2 py-0.5">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Pending confirmation
              </Badge>
            )}

            {isOptimistic && !isPending && (
              <Badge tone="tangerine" className="text-[10px] px-2 py-0.5 animate-spin-slow">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Syncing...
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1 text-xs text-ink/60 font-mono shrink-0">
            <Clock className="h-3 w-3" />
            <time dateTime={event.timestamp}>{formatRelativeTime(event.timestamp)}</time>
          </div>
        </div>

        <p className="mt-1 text-sm text-ink/80 font-medium break-words">
          {event.description}
        </p>

        {(event.amount || memo) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {event.amount && (
              <>
                <AssetBadge code={event.assetCode ?? "XLM"} />
                <Money
                  value={event.amount}
                  assetCode={event.assetCode ?? "XLM"}
                  className="font-mono font-bold text-sm"
                />
              </>
            )}
            {memo && (
              <button
                type="button"
                onClick={() => onFilterByMemo(memo)}
                aria-label={`Show only activity with memo ${memo}`}
                title="Filter by this memo"
                data-testid="activity-memo"
                className="inline-flex items-center gap-1 rounded-md border-2 border-ink bg-butter-pale px-1.5 py-0.5 font-mono text-[11px] text-ink transition-colors hover:bg-butter focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40"
              >
                <Tag className="h-3 w-3" aria-hidden="true" />
                {memo}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
