/**
 * Cache invalidation targets for group- and treasury-scoped writes (issue #526).
 *
 * React Query matches query keys by *prefix*, which makes `["groups"]` a
 * wildcard over every group's expenses, balances, ledger and treasury data.
 * That is why `expenseCacheKeys` invalidates the list exactly; these tests hold
 * the same line for the group/treasury helpers and pin down the prefix
 * relationships they rely on.
 *
 * Runs under `tsx --test` (see package.json `test` script): node:test +
 * node:assert/strict, relative imports, no `@/` aliases.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import {
  groupCacheKeys,
  invalidationFilters,
  qk,
  type InvalidationTarget,
} from "../queries";

const groupId = "group-1";
const otherGroup = "group-2";

/** Seed one cache entry per key so `getQueryState` has something to report. */
function seed(qc: QueryClient, keys: readonly (readonly unknown[])[]) {
  for (const key of keys) qc.setQueryData(key, { seeded: true });
}

/** Apply an invalidation list exactly the way `useInvalidator` does. */
async function invalidate(qc: QueryClient, targets: readonly InvalidationTarget[]) {
  await Promise.all(targets.map((t) => qc.invalidateQueries(invalidationFilters(t))));
}

/** Everything a group's own subtree holds, including a paginated variant. */
const groupSubtree = (id: string) => [
  qk.group(id),
  qk.expenses(id),
  [...qk.expenses(id), "page", 20, null],
  qk.balances(id),
  qk.ledger(id),
  qk.activity(id),
  qk.treasury(id),
  qk.treasuryHistory(id),
];

describe("groupCacheKeys", () => {
  it("is one subtree match plus an exact list match", () => {
    assert.deepEqual(groupCacheKeys(groupId), [
      ["groups", groupId],
      { queryKey: ["groups"], exact: true },
    ]);
  });

  it("invalidates every cached entry under the changed group", async () => {
    const qc = new QueryClient();
    seed(qc, groupSubtree(groupId));

    await invalidate(qc, groupCacheKeys(groupId));

    for (const key of groupSubtree(groupId)) {
      assert.equal(
        qc.getQueryState(key)?.isInvalidated,
        true,
        `${JSON.stringify(key)} should be invalidated by the group prefix`
      );
    }
  });

  it("refreshes the roster count and my role in the group list", async () => {
    const qc = new QueryClient();
    seed(qc, [qk.groups]);

    await invalidate(qc, groupCacheKeys(groupId));

    assert.equal(qc.getQueryState(qk.groups)?.isInvalidated, true);
  });

  it("leaves other groups' data cached, so a member change costs one group", async () => {
    const qc = new QueryClient();
    seed(qc, groupSubtree(otherGroup));

    await invalidate(qc, groupCacheKeys(groupId));

    for (const key of groupSubtree(otherGroup)) {
      assert.equal(
        qc.getQueryState(key)?.isInvalidated,
        false,
        `${JSON.stringify(key)} belongs to another group`
      );
    }
  });

  it("would sweep every group if the list key were matched loosely", async () => {
    // The trap `exact` exists to avoid, written out so the guard has teeth:
    // dropping `exact` from `groupCacheKeys` refetches all of a user's groups
    // on one membership change.
    const qc = new QueryClient();
    seed(qc, groupSubtree(otherGroup));

    await invalidate(qc, [qk.groups]);

    for (const key of groupSubtree(otherGroup)) {
      assert.equal(qc.getQueryState(key)?.isInvalidated, true);
    }
  });
});

describe("treasury cache keys", () => {
  /** The aggregate's live key: the prefix plus the sorted group ids. */
  const aggregateKey = (ids: string[]) => [...qk.treasuryAggregate, ids];

  it("is a sibling of the per-group treasury key, not a child", async () => {
    // `["groups", id, "treasury"]` cannot reach `["treasury", "aggregate"]`,
    // which is why a deposit has to name both.
    const qc = new QueryClient();
    const ownGroup = qk.treasury(groupId);
    const aggregate = aggregateKey([groupId]);
    seed(qc, [ownGroup, aggregate]);

    await invalidate(qc, [ownGroup]);

    assert.equal(qc.getQueryState(ownGroup)?.isInvalidated, true);
    assert.equal(qc.getQueryState(aggregate)?.isInvalidated, false);
  });

  it("invalidates every cached id variant through the aggregate prefix", async () => {
    const qc = new QueryClient();
    const a = aggregateKey([groupId]);
    const b = aggregateKey([groupId, otherGroup]);
    seed(qc, [a, b]);

    await invalidate(qc, [qk.treasuryAggregate]);

    assert.equal(qc.getQueryState(a)?.isInvalidated, true);
    assert.equal(qc.getQueryState(b)?.isInvalidated, true);
  });

  it("reaches the treasury history through the treasury prefix", async () => {
    const qc = new QueryClient();
    seed(qc, [qk.treasury(groupId), qk.treasuryHistory(groupId)]);

    await invalidate(qc, [qk.treasury(groupId)]);

    assert.equal(qc.getQueryState(qk.treasury(groupId))?.isInvalidated, true);
    assert.equal(
      qc.getQueryState(qk.treasuryHistory(groupId))?.isInvalidated,
      true,
      "history is nested under the treasury key"
    );
  });

  it("keeps another group's treasury and aggregate untouched", async () => {
    const qc = new QueryClient();
    const otherTreasury = qk.treasury(otherGroup);
    const aggregate = aggregateKey([otherGroup]);
    seed(qc, [otherTreasury, aggregate]);

    await invalidate(qc, [qk.treasury(groupId)]);

    assert.equal(qc.getQueryState(otherTreasury)?.isInvalidated, false);
    assert.equal(qc.getQueryState(aggregate)?.isInvalidated, false);
  });
});
