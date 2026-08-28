"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle, AlertTriangle, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STELLAR_NETWORK } from "@/lib/constants";

export type HealthStatus = "healthy" | "degraded" | "offline";

interface HorizonHealth {
  status: HealthStatus;
  latencyMs: number | null;
  network: string;
}

export async function checkHorizonHealth(): Promise<HorizonHealth> {
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

    if (!res.ok) {
      return { status: "degraded", latencyMs, network: networkName };
    }

    if (latencyMs > 3000) {
      return { status: "degraded", latencyMs, network: networkName };
    }

    return { status: "healthy", latencyMs, network: networkName };
  } catch {
    return { status: "offline", latencyMs: null, network: networkName };
  }
}

export function HorizonHealthIndicator({ className = "" }: { className?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["horizon-health", STELLAR_NETWORK],
    queryFn: checkHorizonHealth,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const status = data?.status ?? (isLoading ? "healthy" : "offline");
  const latency = data?.latencyMs;
  const network = data?.network ?? (STELLAR_NETWORK === "public" ? "Mainnet" : "Testnet");

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl border-2 border-ink bg-paper px-2.5 py-1 text-xs font-bold shadow-brutal-sm ${className}`}
      aria-label={`Horizon RPC Status: ${status} on ${network}`}
    >
      <span className="flex items-center gap-1.5 text-ink/70">
        <Activity className="h-3.5 w-3.5 text-grape" />
        <span>{network}</span>
      </span>

      {status === "healthy" && (
        <Badge tone="lime" className="text-[10px] py-0.5 px-1.5">
          <CheckCircle className="mr-1 h-3 w-3 inline" />
          {latency ? `${latency}ms` : "Operational"}
        </Badge>
      )}

      {status === "degraded" && (
        <Badge tone="butter" className="text-[10px] py-0.5 px-1.5">
          <AlertTriangle className="mr-1 h-3 w-3 inline" />
          {latency ? `${latency}ms` : "Degraded"}
        </Badge>
      )}

      {status === "offline" && (
        <Badge tone="flamingo" className="text-[10px] py-0.5 px-1.5">
          <WifiOff className="mr-1 h-3 w-3 inline" />
          Offline
        </Badge>
      )}
    </div>
  );
}
