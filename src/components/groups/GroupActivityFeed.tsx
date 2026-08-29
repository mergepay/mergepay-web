"use client";

import { useGroupActivityPolling } from "@/hooks/useGroupActivityPolling";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AssetBadge } from "@/components/asset-badge";
import { Money } from "@/components/amount";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { SectionBoundary, SectionError, SectionLoading } from "@/components/ui/section";
import {
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  PlusCircle,
  Radio,
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
}: {
  activities: GroupActivityEvent[];
}) {
  if (activities.length === 0) {
    return (
      <EmptyState
        icon={<Activity className="h-7 w-7" />}
        title="No activity recorded yet"
        description="Expenses, settlements, and member joins will appear here in real time."
      />
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3" aria-label="Group activity events">
        {activities.map((event: GroupActivityEvent) => (
          <ActivityItem key={event.id} event={event} />
        ))}
      </ul>
    </div>
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
  const options = polling
    ? { intervalMs: pollingIntervalMs ?? 15_000, enabled: true }
    : { intervalMs: false as const, enabled: true };

  const pollingResult = useGroupActivityPolling(groupId, options);

  const {
    activities,
    isLoading,
    isError,
    error,
    refetch,
    isPolling: live,
    pollingStalled,
  } = pollingResult;

  return (
    <SectionBoundary subject="the activity feed">
      <div className={className}>
        {isLoading && (
          <SectionLoading label="Loading group activity feed" minHeight="min-h-[16rem]">
            <ListSkeleton rows={4} />
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
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm uppercase tracking-widest text-ink/60">
                Activity Feed ({activities.length})
              </h3>
              {polling && <PollingIndicator isPolling={live} pollingStalled={pollingStalled} />}
            </div>

            <ActivityList activities={activities} />
          </>
        )}
      </div>
    </SectionBoundary>
  );
}

function ActivityItem({ event }: { event: GroupActivityEvent }) {
  const config = getActivityConfig(event.type);
  const isOptimistic = Boolean(event.isOptimistic);

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

            {isOptimistic && (
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

        {event.amount && (
          <div className="mt-2.5 flex items-center gap-2">
            <AssetBadge code={event.assetCode ?? "XLM"} />
            <Money
              value={event.amount}
              assetCode={event.assetCode ?? "XLM"}
              className="text-base font-bold text-ink"
            />
          </div>
        )}
      </div>
    </li>
  );
}
