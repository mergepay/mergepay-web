import type {
  CreateExpenseRequest,
  GroupActivityEvent,
  GroupActivityResponse,
  GroupDetail,
  Expense,
} from "./types";

/**
 * Sorts activity events in descending order by timestamp (newest first).
 */
export function sortActivityEventsByDateDesc(
  events: GroupActivityEvent[]
): GroupActivityEvent[] {
  return [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

/**
 * Builds an optimistic activity event for a new expense creation request.
 */
export function createOptimisticExpenseEvent(
  groupId: string,
  request: CreateExpenseRequest,
  user?: { id: string; displayName: string; avatarUrl: string | null }
): GroupActivityEvent {
  const actor = user ?? {
    id: request.payerUserId || "current-user",
    displayName: "You",
    avatarUrl: null,
  };

  return {
    id: `opt-activity-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    groupId,
    type: "expense_created",
    actor,
    description: `Added expense "${request.title}"`,
    amount: request.amount,
    assetCode: request.assetCode ?? "XLM",
    timestamp: new Date().toISOString(),
    isOptimistic: true,
    metadata: {
      splitType: request.splitType,
      participantCount: request.shares?.length ?? 0,
    },
  };
}

/**
 * Merges a newly created optimistic event into the existing activity feed cache,
 * ensuring no duplicate events and preserving descending chronological order.
 */
export function calculateOptimisticActivityList(
  current: GroupActivityResponse | undefined,
  newEvent: GroupActivityEvent
): GroupActivityResponse {
  const existing = current?.activities ?? [];
  const updated = [newEvent, ...existing.filter((e: GroupActivityEvent) => e.id !== newEvent.id)];
  return {
    activities: sortActivityEventsByDateDesc(updated),
  };
}

/**
 * Synthesizes chronological activity events from group detail (member joins)
 * and expense history.
 */
export function synthesizeActivityEvents(
  groupDetail?: GroupDetail | null,
  expenses: Expense[] = []
): GroupActivityEvent[] {
  const events: GroupActivityEvent[] = [];

  // Member join events
  if (groupDetail?.members) {
    for (const m of groupDetail.members) {
      events.push({
        id: `activity-member-${m.userId}`,
        groupId: groupDetail.group.id,
        type: "member_joined",
        actor: {
          id: m.userId,
          displayName: m.user.displayName,
          avatarUrl: m.user.avatarUrl,
        },
        description: `Joined the group as ${m.role}`,
        timestamp: m.joinedAt,
      });
    }
  }

  // Expense creation events
  for (const e of expenses) {
    events.push({
      id: `activity-expense-${e.id}`,
      groupId: e.groupId,
      type: "expense_created",
      actor: {
        id: e.payerUserId,
        displayName: e.payer?.displayName ?? "Member",
        avatarUrl: e.payer?.avatarUrl ?? null,
      },
      description: `Added expense "${e.title}"`,
      amount: e.amount,
      assetCode: e.assetCode,
      timestamp: e.createdAt,
    });
  }

  return sortActivityEventsByDateDesc(events);
}
