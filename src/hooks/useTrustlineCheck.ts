"use client";

import { useQuery } from "@tanstack/react-query";
import { hasTrustline } from "@/lib/stellar";

/**
 * React Query hook that proactively checks whether the connected wallet
 * holds the required trustline for a given Stellar asset.
 *
 * Returns cached results with stale-while-revalidate (30 s stale / 5 min
 * cache) so rapid open–close cycles don't re-hit Horizon.
 */
export function useTrustlineCheck(
  assetCode: string,
  assetIssuer: string | null,
  publicKey?: string | null,
) {
  const isNative =
    !assetIssuer ||
    assetCode.toUpperCase() === "XLM" ||
    assetCode.toUpperCase() === "NATIVE";

  return useQuery({
    queryKey: ["trustline", assetCode, assetIssuer, publicKey],
    queryFn: async () => {
      if (isNative || !publicKey || !assetIssuer) {
        return { hasTrustline: true };
      }
      const result = await hasTrustline(publicKey, assetCode, assetIssuer);
      return { hasTrustline: result };
    },
    enabled: !!publicKey && !isNative,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}
