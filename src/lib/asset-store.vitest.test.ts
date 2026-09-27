import { describe, it, expect, beforeEach, vi } from "vitest";

const STORAGE_KEY = "mergepay.activeAsset";

/**
 * Re-import the store so it rehydrates from whatever is currently in
 * localStorage — the same thing a page reload does (#486).
 */
async function freshStore() {
  vi.resetModules();
  return import("./asset-store");
}

function seedStorage(value: string | null) {
  if (value === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, value);
}

describe("asset-store persistence (#486)", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");

  beforeEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(window, "localStorage", originalDescriptor);
    }
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("defaults to XLM when localStorage is empty", async () => {
    const { useAssetStore, DEFAULT_ACTIVE_ASSET } = await freshStore();

    expect(useAssetStore.getState().activeAsset).toEqual(DEFAULT_ACTIVE_ASSET);
    expect(useAssetStore.getState().activeAsset.code).toBe("XLM");
    expect(useAssetStore.getState().activeAsset.issuer).toBeNull();
  });

  it("defaults to XLM when no preference has ever been written", async () => {
    const { useAssetStore } = await freshStore();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(useAssetStore.getState().activeAsset.code).toBe("XLM");
  });

  it("rehydrates the selected unit after a reload", async () => {
    const first = await freshStore();
    first.useAssetStore
      .getState()
      .setActiveAsset({ code: "USDC", issuer: "GAAb...issuer" });

    expect(localStorage.getItem(STORAGE_KEY)).toContain("USDC");

    const second = await freshStore();
    expect(second.useAssetStore.getState().activeAsset).toEqual({
      code: "USDC",
      issuer: "GAAb...issuer",
    });
  });

  it("falls back to XLM when the persisted value is missing or malformed", async () => {
    const cases = [
      '{"state":{"activeAsset":null},"version":1}',
      '{"state":{"activeAsset":{}},"version":1}',
      '{"state":{"activeAsset":{"code":""}},"version":1}',
      '{"state":{"activeAsset":{"code":42}},"version":1}',
      '{"state":{},"version":1}',
      "not json at all",
    ];

    for (const value of cases) {
      seedStorage(value);
      const { useAssetStore } = await freshStore();
      expect(
        useAssetStore.getState().activeAsset.code,
        `expected XLM fallback for ${value}`
      ).toBe("XLM");
    }
  });

  it("falls back to XLM when localStorage itself is unavailable", async () => {
    const throwing: Storage = {
      get length(): number {
        throw new Error("storage disabled");
      },
      clear: () => {},
      getItem: () => {
        throw new Error("storage disabled");
      },
      key: () => null,
      removeItem: () => {},
      setItem: () => {},
    };
    Object.defineProperty(window, "localStorage", {
      value: throwing,
      configurable: true,
    });

    const { useAssetStore } = await freshStore();
    expect(useAssetStore.getState().activeAsset.code).toBe("XLM");
  });

  it("rejects invalid values handed to setActiveAsset", async () => {
    const { useAssetStore } = await freshStore();

    useAssetStore.getState().setActiveAsset({ code: "", issuer: null });
    expect(useAssetStore.getState().activeAsset.code).toBe("XLM");
  });
});
