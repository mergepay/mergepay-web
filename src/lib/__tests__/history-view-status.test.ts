import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_HISTORY_VIEW, readHistoryView, writeHistoryView } from "../history-view";

describe("persisted transaction history filters (#849)", () => {
  it("uses defaults in SSR", () => {
    assert.deepEqual(readHistoryView(), DEFAULT_HISTORY_VIEW);
  });

  it("round-trips the active tab and status filter", () => {
    const previous = (globalThis as { window?: unknown }).window;
    const data = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => { data.set(key, value); },
      },
    };
    try {
      writeHistoryView({ kind: "settlements", filters: { kind: "settlements", status: "pending" } });
      assert.deepEqual(readHistoryView(), {
        kind: "settlements",
        sortOrder: undefined,
        filters: {
          kind: "settlements",
          keyword: undefined,
          assetCode: undefined,
          status: "pending",
          participant: undefined,
          fromDate: undefined,
          toDate: undefined,
        },
      });
      data.set("mergepay.historyView", "not-json");
      assert.deepEqual(readHistoryView(), DEFAULT_HISTORY_VIEW);
    } finally {
      if (previous === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window?: unknown }).window = previous;
    }
  });
});
