"use client";

/**
 * Persistent fiat currency preference (#228).
 *
 * Stores the user's preferred target fiat currency for displaying
 * approximate fiat equivalents alongside crypto amounts. Persisted to
 * localStorage so the preference survives page reloads.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SupportedFiatCurrency } from "@/lib/currency";

interface FiatPreferenceState {
  /** The currently selected fiat currency code. */
  preferredCurrency: SupportedFiatCurrency;
  /** Set the preferred currency. */
  setPreferredCurrency: (currency: SupportedFiatCurrency) => void;
}

export const useFiatPreference = create<FiatPreferenceState>()(
  persist(
    (set) => ({
      preferredCurrency: "USD",
      setPreferredCurrency: (currency) => set({ preferredCurrency: currency }),
    }),
    {
      name: "mergepay:fiat-preference",
      version: 1,
    }
  )
);
