import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hasTrustworthyData,
  resolveQueryView,
  shouldResetQueryCache,
  showsEmptyState,
  showsErrorPanel,
  showsRefreshHint,
  showsSkeleton,
  type QuerySnapshot,
  type QueryViewState,
} from "../queryState";

function snapshot(overrides: Partial<QuerySnapshot> = {}): QuerySnapshot {
  return {
    status: "success",
    fetchStatus: "idle",
    hasData: true,
    isEmpty: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// State resolution
// ---------------------------------------------------------------------------

describe("resolveQueryView", () => {
  const cases: { name: string; snapshot: QuerySnapshot; expected: QueryViewState }[] = [
    {
      name: "disabled query (logged out)",
      snapshot: snapshot({ enabled: false, status: "pending", hasData: false }),
      expected: "idle",
    },
    {
      name: "disabled query that still holds data from a previous session",
      snapshot: snapshot({ enabled: false }),
      expected: "idle",
    },
    {
      name: "first load",
      snapshot: snapshot({ status: "pending", fetchStatus: "fetching", hasData: false, isEmpty: true }),
      expected: "initial-loading",
    },
    {
      name: "first load while offline (paused)",
      snapshot: snapshot({ status: "pending", fetchStatus: "paused", hasData: false, isEmpty: true }),
      expected: "initial-loading",
    },
    {
      name: "failed with nothing to show",
      snapshot: snapshot({ status: "error", fetchStatus: "idle", hasData: false, isEmpty: true }),
      expected: "error",
    },
    {
      name: "failed but earlier data is still held",
      snapshot: snapshot({ status: "error", fetchStatus: "idle" }),
      expected: "stale-error",
    },
    {
      name: "failed retry in flight over existing data",
      snapshot: snapshot({ status: "error", fetchStatus: "fetching" }),
      expected: "stale-error",
    },
    {
      name: "background refetch over existing data",
      snapshot: snapshot({ fetchStatus: "fetching" }),
      expected: "refetching",
    },
    {
      name: "placeholder data while a new key loads",
      snapshot: snapshot({ fetchStatus: "fetching", isPlaceholder: true }),
      expected: "refetching",
    },
    {
      name: "placeholder data that is momentarily idle",
      snapshot: snapshot({ isPlaceholder: true, isEmpty: true }),
      expected: "refetching",
    },
    {
      name: "loaded and empty",
      snapshot: snapshot({ isEmpty: true }),
      expected: "empty",
    },
    {
      name: "loaded with content",
      snapshot: snapshot(),
      expected: "ready",
    },
  ];

  for (const c of cases) {
    it(`maps ${c.name}`, () => {
      assert.equal(resolveQueryView(c.snapshot), c.expected);
    });
  }

  it("never reports empty while the first request is still running", () => {
    for (const fetchStatus of ["fetching", "paused", "idle"] as const) {
      const state = resolveQueryView(
        snapshot({ status: "pending", fetchStatus, hasData: false, isEmpty: true })
      );
      assert.notEqual(state, "empty");
      assert.equal(state, "initial-loading");
    }
  });

  it("does not flash the empty state when the query key changes", () => {
    // A new key resets the query to pending with no data for that key.
    const duringKeyChange = resolveQueryView(
      snapshot({ status: "pending", fetchStatus: "fetching", hasData: false, isEmpty: true })
    );
    assert.equal(showsEmptyState(duringKeyChange), false);
    assert.equal(showsSkeleton(duringKeyChange), true);
  });

  it("keeps existing data visible through a background refetch", () => {
    const state = resolveQueryView(snapshot({ fetchStatus: "fetching" }));
    assert.equal(showsSkeleton(state), false);
    assert.equal(showsErrorPanel(state), false);
    assert.equal(showsRefreshHint(state), true);
    assert.equal(hasTrustworthyData(state), true);
  });

  it("keeps existing data visible when a refresh fails", () => {
    const state = resolveQueryView(snapshot({ status: "error" }));
    assert.equal(state, "stale-error");
    assert.equal(showsErrorPanel(state), false);
    assert.equal(hasTrustworthyData(state), true);
  });
});

// ---------------------------------------------------------------------------
// Totals must never be fabricated
// ---------------------------------------------------------------------------

describe("hasTrustworthyData", () => {
  const trustworthy: QueryViewState[] = ["ready", "empty", "refetching", "stale-error"];
  const untrustworthy: QueryViewState[] = ["idle", "initial-loading", "error"];

  for (const state of trustworthy) {
    it(`allows totals in "${state}"`, () => {
      assert.equal(hasTrustworthyData(state), true);
    });
  }

  for (const state of untrustworthy) {
    it(`suppresses totals in "${state}"`, () => {
      assert.equal(hasTrustworthyData(state), false);
    });
  }

  it("suppresses totals for every state that has no data behind it", () => {
    for (const s of [
      snapshot({ status: "pending", fetchStatus: "fetching", hasData: false, isEmpty: true }),
      snapshot({ status: "error", fetchStatus: "idle", hasData: false, isEmpty: true }),
      snapshot({ enabled: false, status: "pending", hasData: false, isEmpty: true }),
    ]) {
      assert.equal(hasTrustworthyData(resolveQueryView(s)), false);
    }
  });
});

// ---------------------------------------------------------------------------
// Mutually exclusive render paths
// ---------------------------------------------------------------------------

describe("render path selection", () => {
  const allStates: QueryViewState[] = [
    "idle",
    "initial-loading",
    "error",
    "stale-error",
    "refetching",
    "empty",
    "ready",
  ];

  it("never selects more than one blocking panel for a state", () => {
    for (const state of allStates) {
      const blocking = [
        showsSkeleton(state),
        showsErrorPanel(state),
        showsEmptyState(state),
      ].filter(Boolean).length;
      assert.ok(blocking <= 1, `"${state}" selected ${blocking} blocking panels`);
    }
  });

  it("only hints at a refresh when content is already on screen", () => {
    for (const state of allStates) {
      if (!showsRefreshHint(state)) continue;
      assert.equal(showsSkeleton(state), false);
      assert.equal(hasTrustworthyData(state), true);
    }
  });

  it("offers the error panel only when there is nothing else to show", () => {
    for (const state of allStates) {
      if (!showsErrorPanel(state)) continue;
      assert.equal(hasTrustworthyData(state), false);
    }
  });
});

// ---------------------------------------------------------------------------
// Wallet transitions
// ---------------------------------------------------------------------------

describe("shouldResetQueryCache", () => {
  const A = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
  const B = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

  const cases: {
    name: string;
    previous: string | null | undefined;
    next: string | null;
    expected: boolean;
  }[] = [
    { name: "first observation while signed out", previous: undefined, next: null, expected: false },
    { name: "first observation while signed in", previous: undefined, next: A, expected: false },
    { name: "same wallet on re-render", previous: A, next: A, expected: false },
    { name: "still signed out", previous: null, next: null, expected: false },
    { name: "signing in", previous: null, next: A, expected: true },
    { name: "signing out", previous: A, next: null, expected: true },
    { name: "switching wallets", previous: A, next: B, expected: true },
  ];

  for (const c of cases) {
    it(`${c.expected ? "clears" : "keeps"} the cache when ${c.name}`, () => {
      assert.equal(shouldResetQueryCache(c.previous, c.next), c.expected);
    });
  }

  it("clears on every leg of a wallet handover", () => {
    // A → signed out → B: both transitions must drop the previous cache.
    assert.equal(shouldResetQueryCache(A, null), true);
    assert.equal(shouldResetQueryCache(null, B), true);
  });
});
