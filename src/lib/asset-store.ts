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

function safeStorage(): Storage {
  try {
    return localStorage;
  } catch {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      length: 0,
      clear: () => {},
      key: () => null,
    };
  }
}

export const useAssetStore = create<AssetState>()(
  persist(
    (set) => ({
      activeAsset: {
        code: XLM_ASSET.code,
        issuer: XLM_ASSET.issuer,
      },
      setActiveAsset: (asset) => set({ activeAsset: asset }),
      resetActiveAsset: () =>
        set({
          activeAsset: {
            code: XLM_ASSET.code,
            issuer: XLM_ASSET.issuer,
          },
        }),
    }),
    {
      name: "mergepay.activeAsset",
      storage: createJSONStorage(() => safeStorage()),
      version: 1,
    }
  )
);
