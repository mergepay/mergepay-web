"use client";

/**
 * Live multi-asset balances + trustline state for the connected wallet (#344).
 *
 * `getWalletAssets` reads the account's Horizon balances and derives, for
 * every configured settlement asset (XLM + the stable asset), the balance and
 * whether an active trustline exists. React Query carries that snapshot so the
 * treasury widget refetches on focus instead of hammering Horizon, and a
 * trustline that is added elsewhere in the app can invalidate this key.
 *
 * The hook never throws to the caller: a Horizon outage surfaces as
 * `isError` and the widget renders its fallback, which matches how
 * `getWalletAssets` degrades to an empty list for an unreadable account.
 */

import { useQuery } from "@tanstack/react-query";
import { getWalletAssets } from "@/lib/stellar";
import type { TrustlineAsset } from "@/lib/types";

export const WALLET_ASSET_BALANCES_QUERY_KEY = "wallet-asset-balances";

/** Cache-window for balance snapshots, in ms. */
export const WALLET_ASSET_BALANCES_STALE_TIME_MS = 30_000;

export function useWalletAssetBalances(publicKey: string | null | undefined) {
  const query = useQuery({
    queryKey: [WALLET_ASSET_BALANCES_QUERY_KEY, publicKey],
    queryFn: () => getWalletAssets(publicKey as string),
    enabled: Boolean(publicKey),
    staleTime: WALLET_ASSET_BALANCES_STALE_TIME_MS,
  });

  return {
    /** One row per configured asset, or `undefined` while the first fetch runs. */
    assets: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
