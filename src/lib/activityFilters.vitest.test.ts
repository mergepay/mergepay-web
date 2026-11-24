import { describe, expect, it } from "vitest";
import {
  activityFiltersFromSearchParams,
  activityFiltersToSearchParams,
  activityMemberNames,
  activityMemo,
  countActiveActivityFilters,
  filterActivityEvents,
  matchesActivityFilters,
} from "./activityFilters";
import { createOptimisticExpenseEvent, synthesizeActivityEvents } from "./activity";
import type { Expense, GroupActivityEvent } from "./types";

/** Local-time ISO-ish timestamp, so date-range tests don't depend on the TZ. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

function event(overrides: Partial<GroupActivityEvent> & Pick<GroupActivityEvent, "id">): GroupActivityEvent {
  return {
    groupId: "g1",
    type: "expense_created",
    actor: { id: "u1", displayName: "Alice", avatarUrl: null },
    description: "Added expense",
    timestamp: at(2026, 3, 10),
    ...overrides,
  };
}

const dinner = event({
  id: "dinner",
  description: 'Added expense "Dinner at Bistro"',
  amount: "42.50",
  assetCode: "USDC",
  memo: "MP:dinner-8f3a",
  timestamp: at(2026, 3, 10),
});
const settle = event({
  id: "settle",
  type: "payment_settled",
  actor: { id: "u2", displayName: "Bob", avatarUrl: null },
  description: "Settled up",
  amount: "21.25",
  assetCode: "XLM",
  metadata: { memo: "MP:settle-77", counterpartyName: "Alice" },
  timestamp: at(2026, 3, 12),
});
const joined = event({
  id: "joined",
  type: "member_joined",
  actor: { id: "u3", displayName: "Chidi", avatarUrl: null },
  description: "Joined the group as member",
  timestamp: at(2026, 3, 1),
});
const all = [dinner, settle, joined];
const ids = (events: GroupActivityEvent[]) => events.map((e) => e.id);

describe("activityMemo / activityMemberNames", () => {
  it("reads the memo from the top-level field, falling back to metadata", () => {
    expect(activityMemo(dinner)).toBe("MP:dinner-8f3a");
    expect(activityMemo(settle)).toBe("MP:settle-77");
    expect(activityMemo(joined)).toBeNull();
  });

  it("lists the actor plus named counterparties and participants", () => {
    expect(activityMemberNames(settle)).toEqual(["Bob", "Alice"]);
    const split = event({
      id: "split",
      metadata: { participants: ["Dayo", { displayName: "Ebuka" }, 42] },
    });
    expect(activityMemberNames(split)).toEqual(["Alice", "Dayo", "Ebuka"]);
  });
});

describe("matchesActivityFilters", () => {
  it("keeps everything when no filter is set", () => {
    expect(ids(filterActivityEvents(all, {}))).toEqual(["dinner", "settle", "joined"]);
  });

  it("searches description, member names, memo and amount case-insensitively", () => {
    expect(ids(filterActivityEvents(all, { keyword: "bistro" }))).toEqual(["dinner"]);
    expect(ids(filterActivityEvents(all, { keyword: "CHIDI" }))).toEqual(["joined"]);
    expect(ids(filterActivityEvents(all, { keyword: "settle-77" }))).toEqual(["settle"]);
    expect(ids(filterActivityEvents(all, { keyword: "21.25" }))).toEqual(["settle"]);
    // A counterparty counts as a member mentioned by the event.
    expect(ids(filterActivityEvents(all, { keyword: "alice" }))).toEqual(["dinner", "settle"]);
  });

  it("ignores surrounding whitespace in text filters", () => {
    expect(ids(filterActivityEvents(all, { keyword: "  bistro  " }))).toEqual(["dinner"]);
    expect(countActiveActivityFilters({ keyword: "   " })).toBe(0);
  });

  it("filters by member, matching the actor or a counterparty", () => {
    expect(ids(filterActivityEvents(all, { participant: "bob" }))).toEqual(["settle"]);
    expect(ids(filterActivityEvents(all, { participant: "ali" }))).toEqual(["dinner", "settle"]);
  });

  it("filters by memo tag, with or without the MP: prefix", () => {
    expect(ids(filterActivityEvents(all, { memo: "MP:dinner" }))).toEqual(["dinner"]);
    expect(ids(filterActivityEvents(all, { memo: "settle" }))).toEqual(["settle"]);
    // Events without a memo never match a memo filter.
    expect(ids(filterActivityEvents(all, { memo: "mp:" }))).toEqual(["dinner", "settle"]);
  });

  it("filters by asset and excludes events that have none", () => {
    expect(ids(filterActivityEvents(all, { assetCode: "USDC" }))).toEqual(["dinner"]);
    expect(ids(filterActivityEvents(all, { assetCode: "XLM" }))).toEqual(["settle"]);
  });

  it("filters by event type", () => {
    expect(ids(filterActivityEvents(all, { types: ["payment_settled"] }))).toEqual(["settle"]);
    expect(ids(filterActivityEvents(all, { types: ["member_joined", "expense_created"] }))).toEqual([
      "dinner",
      "joined",
    ]);
    expect(ids(filterActivityEvents(all, { types: [] }))).toHaveLength(3);
  });

  it("treats the date range as inclusive whole local days", () => {
    expect(ids(filterActivityEvents(all, { fromDate: "2026-03-10" }))).toEqual(["dinner", "settle"]);
    expect(ids(filterActivityEvents(all, { toDate: "2026-03-10" }))).toEqual(["dinner", "joined"]);
    expect(ids(filterActivityEvents(all, { fromDate: "2026-03-10", toDate: "2026-03-10" }))).toEqual([
      "dinner",
    ]);
    const lateNight = event({ id: "late", timestamp: new Date(2026, 2, 10, 23, 59, 59).toISOString() });
    expect(matchesActivityFilters(lateNight, { toDate: "2026-03-10" })).toBe(true);
    const nextDay = event({ id: "next", timestamp: new Date(2026, 2, 11, 0, 0, 0).toISOString() });
    expect(matchesActivityFilters(nextDay, { toDate: "2026-03-10" })).toBe(false);
  });

  it("ignores a malformed date bound rather than hiding everything", () => {
    expect(filterActivityEvents(all, { fromDate: "not-a-date" })).toHaveLength(3);
  });

  it("combines filters with AND", () => {
    expect(ids(filterActivityEvents(all, { participant: "alice", assetCode: "XLM" }))).toEqual(["settle"]);
    expect(filterActivityEvents(all, { keyword: "bistro", types: ["payment_settled"] })).toEqual([]);
  });
});

describe("countActiveActivityFilters", () => {
  it("counts each narrowing filter once", () => {
    expect(countActiveActivityFilters({})).toBe(0);
    expect(
      countActiveActivityFilters({
        keyword: "a",
        participant: "b",
        memo: "c",
        assetCode: "XLM",
        fromDate: "2026-01-01",
        toDate: "2026-01-02",
        types: ["member_joined", "payment_settled"],
      })
    ).toBe(7);
  });
});

describe("URL round-trip", () => {
  it("serialises filters to search params and reads them back", () => {
    const filters = {
      keyword: "dinner",
      memo: "MP:dinner",
      assetCode: "USDC",
      fromDate: "2026-03-01",
      types: ["expense_created", "payment_settled"] as GroupActivityEvent["type"][],
    };
    const query = activityFiltersToSearchParams(filters);
    expect(query).toBe("q=dinner&memo=MP%3Adinner&asset=USDC&from=2026-03-01&type=expense_created%2Cpayment_settled");
    expect(activityFiltersFromSearchParams(new URLSearchParams(query))).toEqual({
      ...filters,
      participant: undefined,
      toDate: undefined,
    });
  });

  it("keeps unrelated params and removes cleared filters", () => {
    expect(activityFiltersToSearchParams({ keyword: "x" }, "tab=ledger&memo=old")).toBe("tab=ledger&q=x");
    expect(activityFiltersToSearchParams({}, "tab=ledger&q=x")).toBe("tab=ledger");
  });

  it("drops unknown event types from a hand-edited link", () => {
    expect(activityFiltersFromSearchParams(new URLSearchParams("type=bogus,member_joined")).types).toEqual([
      "member_joined",
    ]);
    expect(activityFiltersFromSearchParams(new URLSearchParams("type=bogus")).types).toBeUndefined();
  });
});

describe("memo on activity events", () => {
  it("synthesized expense events carry the expense memo", () => {
    const expense = {
      id: "e1",
      groupId: "g1",
      payerUserId: "u1",
      payer: { displayName: "Alice", avatarUrl: null },
      title: "Fuel",
      amount: "10",
      assetCode: "XLM",
      memo: "MP:fuel-1",
      createdAt: at(2026, 3, 1),
    } as unknown as Expense;
    const [synth] = synthesizeActivityEvents(null, [expense]);
    expect(synth.memo).toBe("MP:fuel-1");
    expect(matchesActivityFilters(synth, { memo: "fuel" })).toBe(true);
  });

  it("optimistic expense events carry the memo being submitted", () => {
    const optimistic = createOptimisticExpenseEvent("g1", {
      title: "Snacks",
      amount: "5",
      assetCode: "XLM",
      splitType: "equal",
      payerUserId: "u1",
      shares: [],
      memo: "MP:snacks",
    } as never);
    expect(activityMemo(optimistic)).toBe("MP:snacks");
  });
});
