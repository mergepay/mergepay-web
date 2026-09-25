"use client";

import { useQuery } from "@tanstack/react-query";
import { STELLAR_NETWORK } from "@/lib/constants";

export type StellarNetworkStatus = "healthy" | "degraded" | "offline";

export interface StellarNetworkStatusData {
  status: StellarNetworkStatus;
  latencyMs: number | null;
  network: string;
  horizonUrl: string;
  lastChecked: number;
}

export async function fetchStellarNetworkStatus(): Promise<StellarNetworkStatusData> {
  const isPublic = STELLAR_NETWORK === "public";
  const networkName = isPublic ? "Mainnet" : "Testnet";
  const horizonUrl = isPublic
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";

  const start = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(horizonUrl, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    clearTimeout(timer);

    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok || latencyMs > 3000) {
      return {
        status: "degraded",
        latencyMs,
        network: networkName,
        horizonUrl,
        lastChecked: Date.now(),
      };
    }

    return {
      status: "healthy",
      latencyMs,
      network: networkName,
      horizonUrl,
      lastChecked: Date.now(),
    };
  } catch {
    return {
      status: "offline",
      latencyMs: null,
      network: networkName,
      horizonUrl,
      lastChecked: Date.now(),
    };
  }
}

export interface UseStellarNetworkStatusResult {
  data: StellarNetworkStatusData | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  status: StellarNetworkStatus;
  latencyMs: number | null;
  network: string;
  refetch: () => void;
}

/**
 * React Query hook that fetches and caches Stellar Horizon / RPC status and ledger latency.
 * Periodically polls the Horizon instance configured via environment constants.
 */

export function useStellarNetworkStatus(): UseStellarNetworkStatusResult {
  const query = useQuery({
    queryKey: ["stellar-network-status", STELLAR_NETWORK],
    queryFn: fetchStellarNetworkStatus,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });

  const defaultNetwork = STELLAR_NETWORK === "public" ? "Mainnet" : "Testnet";
  const status = query.data?.status ?? (query.isLoading ? "healthy" : "offline");
  const latencyMs = query.data?.latencyMs ?? null;
  const network = query.data?.network ?? defaultNetwork;

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    status,
    latencyMs,
    network,
    refetch: query.refetch,
  };
}
