import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { renderHook, act } from "@testing-library/react";
import { useExpenseDraft } from "../use-expense-draft";

describe("useExpenseDraft hook", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    (global as any).window = {
      localStorage: {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
      },
    };
  });

  it("loads existing draft on mount if available", () => {
    store["mergepay:expense_draft:g1"] = JSON.stringify({
      title: "Dinner",
      amount: "50",
      assetKey: "XLM",
    });

    const { result } = renderHook(() => useExpenseDraft("g1"));
    assert.equal(result.current.isRestored, true);
    assert.equal(result.current.draft?.title, "Dinner");
  });

  it("saves draft updates to localStorage", () => {
    const { result } = renderHook(() => useExpenseDraft("g2"));

    act(() => {
      result.current.saveDraft({
        title: "Hotel",
        description: "Room",
        amount: "200",
        assetKey: "USDC",
        payerUserId: "u1",
        splitType: "equal",
        participants: ["u1", "u2"],
        custom: {},
        percent: {},
        memo: "ROOM",
      });
    });

    assert.equal(result.current.draft?.title, "Hotel");
    assert.ok(store["mergepay:expense_draft:g2"]);
  });

  it("clears draft correctly", () => {
    store["mergepay:expense_draft:g3"] = JSON.stringify({
      title: "Taxi",
      amount: "25",
    });

    const { result } = renderHook(() => useExpenseDraft("g3"));
    assert.equal(result.current.isRestored, true);

    act(() => {
      result.current.clearDraft();
    });

    assert.equal(result.current.draft, null);
    assert.equal(result.current.isRestored, false);
    assert.equal(store["mergepay:expense_draft:g3"], undefined);
  });
});
