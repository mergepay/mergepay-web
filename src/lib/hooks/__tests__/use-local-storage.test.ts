import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorage } from "../use-local-storage";

describe("useLocalStorage hook", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    (global as any).window = {
      localStorage: {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          if (key === "quota-exceeded") {
            throw new Error("QuotaExceededError");
          }
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
      },
    };
  });

  it("returns initial value when storage is empty", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", "default-val"));
    const [value] = result.current;
    assert.equal(value, "default-val");
  });

  it("persists and retrieves values correctly", () => {
    const { result } = renderHook(() => useLocalStorage("currency-pref", "XLM"));
    
    act(() => {
      const [, setValue] = result.current;
      setValue("USDC");
    });

    const [updatedValue] = result.current;
    assert.equal(updatedValue, "USDC");
    assert.equal(store["currency-pref"], JSON.stringify("USDC"));
  });

  it("handles quota exceeded and storage errors gracefully", () => {
    const { result } = renderHook(() => useLocalStorage("quota-exceeded", "initial"));

    act(() => {
      const [, setValue] = result.current;
      setValue("new-val");
    });

    // Should not throw and keep local state updated or handle safely
    const [value] = result.current;
    assert.equal(value, "new-val");
  });
});
