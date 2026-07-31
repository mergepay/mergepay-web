import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dedupeById,
  describeSettlementStatus,
  hasTransactionMetadata,
  humanizeUnknownStatus,
} from "../settlementStatusDisplay";
import type { SettlementStatus } from "../types";

const ALL_STATUSES: SettlementStatus[] = [
  "pending",
  "submitted",
  "confirmed",
  "failed",
];

describe("describeSettlementStatus — supported statuses", () => {
  it("describes every status declared in types.ts", () => {
    for (const status of ALL_STATUSES) {
      const view = describeSettlementStatus(status);
      assert.notEqual(view.kind, "unknown", status);
      assert.ok(view.label.length > 0, status);
      assert.ok(view.detail.length > 0, status);
    }
  });

  it("groups pending and submitted as in-flight, never recoverable", () => {
    for (const status of ["pending", "submitted"] as const) {
      const view = describeSettlementStatus(status);
      assert.equal(view.kind, "pending", status);
      assert.equal(view.isInFlight, true, status);
      // The key guard against duplicate payments: no recovery affordance
      // while a transaction may still land.
      assert.equal(view.canRecover, false, status);
    }
  });

  it("distinguishes pending from submitted by the last known action", () => {
    const pending = describeSettlementStatus("pending");
    const submitted = describeSettlementStatus("submitted");
    assert.notEqual(pending.label, submitted.label);
    assert.notEqual(pending.detail, submitted.detail);
  });

  it("marks confirmed as completed and terminal", () => {
    const view = describeSettlementStatus("confirmed");
    assert.equal(view.kind, "completed");
    assert.equal(view.label, "Completed");
    assert.equal(view.tone, "lime");
    assert.equal(view.isInFlight, false);
    assert.equal(view.canRecover, false);
  });

  it("marks failed as recoverable with an actionable message", () => {
    const view = describeSettlementStatus("failed");
    assert.equal(view.kind, "failed");
    assert.equal(view.tone, "flamingo");
    assert.equal(view.isInFlight, false);
    assert.equal(view.canRecover, true);
    assert.match(view.detail, /not settled/);
  });

  it("gives each kind a distinct tone", () => {
    const tones = new Set(
      ALL_STATUSES.map((s) => describeSettlementStatus(s).tone)
    );
    // pending and submitted intentionally share a tone; the labels differ.
    assert.equal(tones.size, 3);
  });
});

describe("describeSettlementStatus — unrecognized statuses", () => {
  it("falls back to a readable unknown state", () => {
    const view = describeSettlementStatus("reversed");
    assert.equal(view.kind, "unknown");
    assert.equal(view.label, "Reversed");
    assert.equal(view.tone, "paper");
    assert.ok(view.detail.length > 0);
  });

  it("never claims an unknown status is recoverable or complete", () => {
    for (const raw of ["reversed", "clawed_back", "", null, undefined, 7, {}]) {
      const view = describeSettlementStatus(raw);
      assert.equal(view.kind, "unknown", String(raw));
      assert.equal(view.canRecover, false, String(raw));
      // Conservative: assume it may still be in flight so no "pay again".
      assert.equal(view.isInFlight, true, String(raw));
    }
  });

  it("does not treat a lookalike status as known", () => {
    assert.equal(describeSettlementStatus("Confirmed").kind, "unknown");
    assert.equal(describeSettlementStatus(" confirmed").kind, "unknown");
  });
});

describe("humanizeUnknownStatus", () => {
  it("turns separators into spaces and capitalizes", () => {
    assert.equal(humanizeUnknownStatus("clawed_back"), "Clawed back");
    assert.equal(humanizeUnknownStatus("partially-refunded"), "Partially refunded");
  });

  it("strips characters that are not safe to echo back", () => {
    assert.equal(humanizeUnknownStatus("<script>alert(1)</script>"), "Scriptalert1script");
    assert.equal(humanizeUnknownStatus("failed!! @#$"), "Failed");
  });

  it("caps the length of an oversized value", () => {
    assert.equal(humanizeUnknownStatus("a".repeat(200)).length, 32);
  });

  it("falls back to Unknown when nothing usable remains", () => {
    assert.equal(humanizeUnknownStatus(""), "Unknown");
    assert.equal(humanizeUnknownStatus("   "), "Unknown");
    assert.equal(humanizeUnknownStatus("!!!"), "Unknown");
    assert.equal(humanizeUnknownStatus(null), "Unknown");
    assert.equal(humanizeUnknownStatus(undefined), "Unknown");
    assert.equal(humanizeUnknownStatus(123), "Unknown");
  });
});

describe("hasTransactionMetadata", () => {
  it("is true only for a non-empty hash", () => {
    assert.equal(hasTransactionMetadata({ stellarTxHash: "abc123" }), true);
  });

  it("is false when the API has no hash to show yet", () => {
    assert.equal(hasTransactionMetadata({ stellarTxHash: null }), false);
    assert.equal(hasTransactionMetadata({ stellarTxHash: "" }), false);
    assert.equal(hasTransactionMetadata({ stellarTxHash: "   " }), false);
  });
});

describe("dedupeById", () => {
  it("keeps the first occurrence of each id", () => {
    const records = [
      { id: "a", status: "pending" },
      { id: "b", status: "confirmed" },
      { id: "a", status: "confirmed" },
    ];
    const result = dedupeById(records);
    assert.deepEqual(
      result.map((r) => r.id),
      ["a", "b"]
    );
    assert.equal(result[0].status, "pending");
  });

  it("returns an empty list unchanged", () => {
    assert.deepEqual(dedupeById([]), []);
  });

  it("leaves an already-unique list in order", () => {
    const records = [{ id: "a" }, { id: "b" }, { id: "c" }];
    assert.deepEqual(
      dedupeById(records).map((r) => r.id),
      ["a", "b", "c"]
    );
  });

  it("does not mutate the input", () => {
    const records = [{ id: "a" }, { id: "a" }];
    dedupeById(records);
    assert.equal(records.length, 2);
  });
});
