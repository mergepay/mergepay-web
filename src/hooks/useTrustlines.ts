"use client";

import { useQuery } from "@tanstack/react-query";
import { hasTrustline } from "@/lib/stellar";

export interface TrustlineAssetRequirement {
  code: string;
  issuer?: string | null;
  /** Optional display name (e.g. "USDC" vs the raw asset code). */
  name?: string;
}

/**
 * Batch trustline check for a set of asset requirements.
 *
 * Returns per-asset results plus the subset of assets that still need a
 * trustline, so callers can render the list and drive the "add missing
 * trustlines" flow without re-checking each asset individually.
 */
export function useTrustlines(
  publicKey: string,
  assets: TrustlineAssetRequirement[]
) {
  const query = useQuery({
    queryKey: ["trustlines", publicKey, assets],
    queryFn: async () => {
      const results = await Promise.all(
        assets.map(async (asset) => {
          const isNative =
            !asset.issuer ||
            asset.code.toUpperCase() === "XLM" ||
            asset.code.toUpperCase() === "NATIVE";
          let hasTrustlineValue = true;
          if (!isNative && publicKey && asset.issuer) {
            hasTrustlineValue = await hasTrustline(
              publicKey,
              asset.code,
              asset.issuer
            );
          }
          return { asset, hasTrustline: hasTrustlineValue };
        })
      );
      const missingAssets = results
        .filter((r) => !r.hasTrustline)
        .map((r) => r.asset);
      return {
        results,
        missingAssets,
        hasMissing: missingAssets.length > 0,
      };
    },
    enabled: Boolean(publicKey) && assets.length > 0,
    staleTime: 30_000,
  });

  return {
    results: query.data?.results ?? [],
    missingAssets: query.data?.missingAssets ?? [],
    hasMissing: query.data?.hasMissing ?? false,
    refetch: query.refetch,
  };
}
