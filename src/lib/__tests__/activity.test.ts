import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sortActivityEventsByDateDesc,
  createOptimisticExpenseEvent,
  calculateOptimisticActivityList,
  synthesizeActivityEvents,
} from "../activity";
import type {
  CreateExpenseRequest,
  GroupActivityEvent,
  GroupActivityResponse,
  GroupDetail,
  Expense,
} from "../types";

describe("Group Activity Feed Helpers & Optimistic Updates", () => {
  describe("sortActivityEventsByDateDesc", () => {
    it("sorts activity events by timestamp descending", () => {
      const events: GroupActivityEvent[] = [
        {
          id: "1",
          groupId: "g1",
          type: "expense_created",
          actor: { id: "u1", displayName: "Alice", avatarUrl: null },
          description: "Lunch",
          timestamp: "2026-01-10T12:00:00Z",
        },
        {
          id: "2",
          groupId: "g1",
          type: "member_joined",
          actor: { id: "u2", displayName: "Bob", avatarUrl: null },
          description: "Joined",
          timestamp: "2026-01-15T12:00:00Z",
        },
        {
          id: "3",
          groupId: "g1",
          type: "payment_settled",
          actor: { id: "u1", displayName: "Alice", avatarUrl: null },
          description: "Settled",
          timestamp: "2026-01-05T12:00:00Z",
        },
      ];

      const sorted = sortActivityEventsByDateDesc(events);
      assert.deepEqual(
        sorted.map((e) => e.id),
        ["2", "1", "3"]
      );
    });
  });

  describe("createOptimisticExpenseEvent", () => {
    it("creates an optimistic event with isOptimistic flag and user actor", () => {
      const req: CreateExpenseRequest = {
        title: "Dinner & Drinks",
        amount: "150.0000000",
        assetCode: "USDC",
        splitType: "equal",
        shares: [
          { userId: "u1", amount: "75.0000000" },
          { userId: "u2", amount: "75.0000000" },
        ],
      };

      const actor = {
        id: "u1",
        displayName: "Charlie",
        avatarUrl: "https://example.com/charlie.png",
      };

      const event = createOptimisticExpenseEvent("g1", req, actor);

      assert.equal(event.groupId, "g1");
      assert.equal(event.type, "expense_created");
      assert.equal(event.isOptimistic, true);
      assert.equal(event.amount, "150.0000000");
      assert.equal(event.assetCode, "USDC");
      assert.equal(event.description, 'Added expense "Dinner & Drinks"');
      assert.deepEqual(event.actor, actor);
      assert.ok(event.id.startsWith("opt-activity-"));
    });
  });

  describe("calculateOptimisticActivityList", () => {
    it("prepends optimistic event to activity response without duplicates", () => {
      const existing: GroupActivityResponse = {
        activities: [
          {
            id: "act-1",
            groupId: "g1",
            type: "member_joined",
            actor: { id: "u1", displayName: "Alice", avatarUrl: null },
            description: "Joined",
            timestamp: "2026-01-01T00:00:00Z",
          },
        ],
      };

      const optEvent: GroupActivityEvent = {
        id: "opt-1",
        groupId: "g1",
        type: "expense_created",
        actor: { id: "u1", displayName: "Alice", avatarUrl: null },
        description: 'Added expense "Coffee"',
        amount: "10.0000000",
        assetCode: "XLM",
        timestamp: "2026-01-02T00:00:00Z",
        isOptimistic: true,
      };

      const updated = calculateOptimisticActivityList(existing, optEvent);
      assert.equal(updated.activities.length, 2);
      assert.equal(updated.activities[0].id, "opt-1");
      assert.equal(updated.activities[0].isOptimistic, true);
    });

    it("retains previous state for clean rollback on error", () => {
      const initial: GroupActivityResponse = {
        activities: [
          {
            id: "act-1",
            groupId: "g1",
            type: "member_joined",
            actor: { id: "u1", displayName: "Alice", avatarUrl: null },
            description: "Joined",
            timestamp: "2026-01-01T00:00:00Z",
          },
        ],
      };

      const optEvent: GroupActivityEvent = {
        id: "opt-1",
        groupId: "g1",
        type: "expense_created",
        actor: { id: "u1", displayName: "Alice", avatarUrl: null },
        description: "Failed expense",
        timestamp: "2026-01-02T00:00:00Z",
        isOptimistic: true,
      };

      const optimisticState = calculateOptimisticActivityList(initial, optEvent);
      assert.equal(optimisticState.activities.length, 2);

      // Simulating rollback by restoring initial state
      const rolledBackState = initial;
      assert.equal(rolledBackState.activities.length, 1);
      assert.equal(rolledBackState.activities[0].id, "act-1");
    });
  });

  describe("synthesizeActivityEvents", () => {
    it("synthesizes member join and expense events chronologically", () => {
      const detail: GroupDetail = {
        group: {
          id: "g1",
          name: "Trip",
          description: null,
          createdByUserId: "u1",
          treasuryEnabled: false,
          treasuryAccountPublicKey: null,
          treasuryRequiredSigners: null,
          archived: false,
          createdAt: "2026-01-01T00:00:00Z",
        },
        members: [
          {
            id: "m1",
            userId: "u1",
            groupId: "g1",
            role: "admin",
            joinedAt: "2026-01-01T00:00:00Z",
            user: {
              id: "u1",
              displayName: "Alice",
              avatarUrl: null,
              stellarPublicKey: "G1...",
              createdAt: "2026-01-01T00:00:00Z",
            },
          },
        ],
        yourRole: "admin",
      };

      const expenses: Expense[] = [
        {
          id: "e1",
          groupId: "g1",
          payerUserId: "u1",
          payer: {
            id: "u1",
            displayName: "Alice",
            avatarUrl: null,
            stellarPublicKey: "G1...",
            createdAt: "2026-01-01T00:00:00Z",
          },
          title: "Hotel",
          description: null,
          amount: "500.0000000",
          assetCode: "USDC",
          assetIssuer: null,
          splitType: "equal",
          memo: null,
          receiptUrl: null,
          createdAt: "2026-01-02T10:00:00Z",
          shares: [],
        },
      ];

      const events = synthesizeActivityEvents(detail, expenses);
      assert.equal(events.length, 2);
      assert.equal(events[0].id, "activity-expense-e1");
      assert.equal(events[1].id, "activity-member-u1");
    });
  });
});
