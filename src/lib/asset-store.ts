"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { XLM_ASSET } from "./constants";

export interface ActiveAsset {
  code: string;
  issuer: string | null;
}

interface AssetState {
  activeAsset: ActiveAsset;
  setActiveAsset: (asset: ActiveAsset) => void;
  resetActiveAsset: () => void;
}

/** What we fall back to whenever the stored preference is missing or unusable. */
export const DEFAULT_ACTIVE_ASSET: ActiveAsset = {
  code: XLM_ASSET.code,
  issuer: XLM_ASSET.issuer,
};

/**
 * A persisted value is only trusted if it can actually drive a selector:
 * a non-empty asset code plus an issuer that is either null (native XLM) or a
 * string. Anything else — `null`, `{}`, `{ code: "" }`, a stray string — is
 * treated as absent so rehydration falls back to XLM instead of crashing the
 * asset switcher on `activeAsset.code`.
 */
export function isActiveAsset(value: unknown): value is ActiveAsset {
  if (typeof value !== "object" || value === null) return false;
  const { code, issuer } = value as { code?: unknown; issuer?: unknown };
  return (
    typeof code === "string" &&
    code.length > 0 &&
    (issuer === null || typeof issuer === "string")
  );
}

/** Storage stub used when window/localStorage is unavailable (SSR, blocked storage). */
function unavailableStorage(): Storage {
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    length: 0,
    clear: () => {},
    key: () => null,
  };
}

function safeStorage(): Storage {
  // `createJSONStorage` evaluates this eagerly at module scope, so the server
  // render must not touch the browser-only `localStorage` global.
  if (typeof window === "undefined") return unavailableStorage();
  try {
    return localStorage;
  } catch {
    return unavailableStorage();
  }
}

export const useAssetStore = create<AssetState>()(
  persist(
    (set) => ({
      activeAsset: DEFAULT_ACTIVE_ASSET,
      setActiveAsset: (asset) =>
        set({ activeAsset: isActiveAsset(asset) ? asset : DEFAULT_ACTIVE_ASSET }),
      resetActiveAsset: () => set({ activeAsset: DEFAULT_ACTIVE_ASSET }),
    }),
    {
      name: "mergepay.activeAsset",
      storage: createJSONStorage(() => safeStorage()),
      version: 1,
      // Runs for empty storage too (persisted state is `undefined` there), so a
      // missing, stale, or corrupt preference always lands on XLM. `persisted`
      // is the inner state object zustand already unwrapped from the envelope.
      merge: (persisted, current) => {
        const activeAsset = (persisted as { activeAsset?: unknown } | null | undefined)
          ?.activeAsset;
        return {
          ...current,
          activeAsset: isActiveAsset(activeAsset) ? activeAsset : DEFAULT_ACTIVE_ASSET,
        };
      },
    }
  )
);
