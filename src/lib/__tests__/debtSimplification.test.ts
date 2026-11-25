/**
 * Issue #523 — unit tests for `simplifyDebts` in src/lib/settlementUtils.ts.
 *
 * The greedy debt-reduction step turns everyone's signed net into the minimal
 * set of "pay this person that amount" suggestions the balances panel shows, so
 * an error here becomes a wrong on-chain payment. These cover the degenerate
 * and multi-asset shapes the caller in `balances-panel.tsx` can actually hand
 * it: `GET /groups/:id/balances` returns one row per member *per asset*, all
 * flattened into a single array.
 *
 * Uses node:test because `npm test` runs these through `tsx --test`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { simplifyDebts } from "../settlementUtils";
import type { MemberBalance } from "../types";

const user = (id: string) => ({
  id,
  stellarPublicKey: `G${id}`,
  displayName: id,
  avatarUrl: null,
  createdAt: "2024-01-01",
});

/** Build a member row; `net` is the signed decimal string the API returns. */
function member(userId: string, net: string, assetCode = "XLM"): MemberBalance {
  return { userId, user: user(userId), net, assetCode };
}

/** Compact projection: [from, to, amount] or [from, to, amount, assetCode]. */
const paths = (rows: MemberBalance[]) =>
  simplifyDebts(rows).map((p) => [p.fromUserId, p.toUserId, p.amount, p.assetCode]);

describe("simplifyDebts — degenerate groups (#523)", () => {
  it("suggests nothing for an empty group", () => {
    assert.deepEqual(simplifyDebts([]), []);
  });

  it("suggests nothing when everyone is square", () => {
    // Note both spellings of zero: the API sends "0.0000000" but a locally
    // derived net can be a bare "0".
    assert.deepEqual(simplifyDebts([member("a", "0.0000000"), member("b", "0"), member("c", "0.00")]), []);
  });

  it("suggests nothing when nobody owes (all credits)", () => {
    assert.deepEqual(simplifyDebts([member("a", "5"), member("b", "3")]), []);
  });

  it("suggests nothing when nobody is owed (all debts)", () => {
    assert.deepEqual(simplifyDebts([member("a", "-5"), member("b", "-3")]), []);
  });

  it("ignores whitespace-padded nets", () => {
    assert.deepEqual(paths([member("a", " 5 "), member("b", "-5 ")]), [["b", "a", "5", "XLM"]]);
  });
});

describe("simplifyDebts — greedy reduction shape", () => {
  it("routes one debtor through every creditor it owes", () => {
    assert.deepEqual(
      paths([member("d", "-6"), member("c1", "1"), member("c2", "2"), member("c3", "3")]),
      [
        ["d", "c1", "1", "XLM"],
        ["d", "c2", "2", "XLM"],
        ["d", "c3", "3", "XLM"],
      ]
    );
  });

  it("pairs the largest creditor with the largest debtor without re-sorting", () => {
    // Order comes from the input array, not from the amounts: the panel keeps
    // the API's member order, and re-ordering here would reshuffle suggestions
    // between renders.
    assert.deepEqual(
      paths([member("x", "1"), member("y", "100"), member("d", "-101")]),
      [
        ["d", "x", "1", "XLM"],
        ["d", "y", "100", "XLM"],
      ]
    );
  });

  it("settles only what the debtors actually owe when the nets do not balance", () => {
    // A group whose rows sum to +7 (e.g. one member's row is missing from the
    // response) yields one partial path and no phantom payment for the rest.
    assert.deepEqual(paths([member("a", "10"), member("b", "-3")]), [["b", "a", "3", "XLM"]]);
  });

  it("spends a creditor dry before moving to the next", () => {
    assert.deepEqual(
      paths([member("a", "4"), member("b", "4"), member("d", "-6")]),
      [
        ["d", "a", "4", "XLM"],
        ["d", "b", "2", "XLM"],
      ]
    );
  });
});

describe("simplifyDebts — amounts stay stroop-exact", () => {
  it("sums the paths back to the total owed, to the stroop", () => {
    const rows = [
      member("a", "3.3333333"),
      member("b", "3.3333334"),
      member("c", "-6.6666667"),
    ];
    const out = simplifyDebts(rows);
    assert.deepEqual(
      out.map((p) => [p.fromUserId, p.toUserId, p.amount]),
      [
        ["c", "a", "3.3333333"],
        ["c", "b", "3.3333334"],
      ]
    );
    const paid = out.reduce((total, p) => total + BigInt(p.amount.replace(".", "").padEnd(7, "0")), 0n);
    assert.equal(paid, 66_666_667n);
  });

  it("carries a single stroop across untouched", () => {
    assert.equal(simplifyDebts([member("a", "0.0000001"), member("b", "-0.0000001")])[0].amount, "0.0000001");
  });

  it("renders amounts without trailing zeros", () => {
    // Unlike `split.ts`'s fromStroops (always 7 decimals, wire format), these
    // amounts are display strings for the panel.
    const [path] = simplifyDebts([member("a", "3.5000000"), member("b", "-3.5")]);
    assert.equal(path.amount, "3.5");
  });

  it("handles a whole-number net with no decimal point", () => {
    const [path] = simplifyDebts([member("a", "7"), member("b", "-7")]);
    assert.equal(path.amount, "7");
  });
});

describe("simplifyDebts — nets only offset within one asset (#523)", () => {
  it("never pays a USDC credit with XLM", () => {
    // The balances endpoint returns every asset in one flat list. Offsetting
    // across assets would suggest a transfer that cannot settle, priced in
    // whichever asset the debtor happened to hold.
    assert.deepEqual(simplifyDebts([member("a", "5", "USDC"), member("b", "-5", "XLM")]), []);
  });

  it("simplifies each asset independently", () => {
    assert.deepEqual(
      paths([
        member("a", "5", "USDC"),
        member("b", "-5", "USDC"),
        member("c", "3", "XLM"),
        member("d", "-3", "XLM"),
      ]),
      [
        ["b", "a", "5", "USDC"],
        ["d", "c", "3", "XLM"],
      ]
    );
  });

  it("keeps debtors and creditors in their own asset bucket", () => {
    // XLM: b owes 2 to a. USDC: d owes 4 to c. A single pooled pass would
    // instead pair b->a 2 / d->c 2 / c short 2 in the wrong currency.
    assert.deepEqual(
      paths([
        member("a", "2", "XLM"),
        member("b", "-2", "XLM"),
        member("c", "4", "USDC"),
        member("d", "-4", "USDC"),
      ]),
      [
        ["b", "a", "2", "XLM"],
        ["d", "c", "4", "USDC"],
      ]
    );
  });

  it("emits buckets in first-appearance order", () => {
    const out = simplifyDebts([
      member("a", "1", "USDC"),
      member("b", "-1", "USDC"),
      member("c", "1", "XLM"),
      member("d", "-1", "XLM"),
      member("e", "1", "BTC"),
      member("f", "-1", "BTC"),
    ]);
    assert.deepEqual(
      out.map((p) => p.assetCode),
      ["USDC", "XLM", "BTC"]
    );
  });
});

describe("simplifyDebts — path payloads the panel renders", () => {
  it("carries both user records through untouched", () => {
    const rows = [member("alice", "9"), member("bob", "-9")];
    const [path] = simplifyDebts(rows);
    assert.equal(path.from, rows[1].user);
    assert.equal(path.to, rows[0].user);
    assert.equal(path.from.stellarPublicKey, "Gbob");
    assert.equal(path.to.displayName, "alice");
  });

  it("reports each member once even when the same id repeats", () => {
    // Defensive: the API is expected to return one row per member per asset,
    // so duplicate ids only appear across assets and stay separated.
    const out = simplifyDebts([
      member("a", "5", "XLM"),
      member("a", "5", "USDC"),
      member("b", "-5", "XLM"),
      member("c", "-5", "USDC"),
    ]);
    assert.deepEqual(
      out.map((p) => [p.fromUserId, p.toUserId, p.assetCode]),
      [
        ["b", "a", "XLM"],
        ["c", "a", "USDC"],
      ]
    );
  });
});
