import { NextResponse } from "next/server";

/** Resolved status for a single dependency. */
type DependencyStatus = "ok" | "degraded";

/** Shape of the JSON body returned by GET /api/health. */
export interface HealthResponse {
  status: "ok" | "degraded";
  uptime: number;
  timestamp: string;
  dependencies: {
    api: DependencyStatus;
    stellar: DependencyStatus;
  };
}

/**
 * Probe a URL with a hard timeout.
 *
 * Returns "ok" when the server responds with any HTTP status code (we only
 * care that it is reachable, not that the response body is meaningful).
 * Returns "degraded" on network errors or when the request takes longer than
 * `timeoutMs` milliseconds.
 */
async function probe(url: string, timeoutMs = 5_000): Promise<DependencyStatus> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fetch(url, { method: "GET", signal: controller.signal });
      return "ok";
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return "degraded";
  }
}

/**
 * GET /api/health
 *
 * Returns the operational status of the server and its upstream dependencies.
 * Always responds with HTTP 200 so monitoring tools do not raise false alarms
 * on a single degraded dependency; inspect `status` in the body instead.
 *
 * Response shape:
 * ```json
 * {
 *   "status": "ok" | "degraded",
 *   "uptime": 123.456,
 *   "timestamp": "2026-01-01T00:00:00.000Z",
 *   "dependencies": {
 *     "api": "ok" | "degraded",
 *     "stellar": "ok" | "degraded"
 *   }
 * }
 * ```
 *
 * No authentication is required.
 */
export async function GET(): Promise<NextResponse<HealthResponse>> {
  // Read base URLs from env vars (same variables the rest of the app uses).
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const horizonUrl =
    process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";

  // Run both dependency probes concurrently so the check stays fast (< 1 s
  // under normal conditions; bounded by the 5 s timeout in the worst case).
  const [apiResult, stellarResult] = await Promise.allSettled([
    probe(`${apiUrl}/health`),
    probe(horizonUrl),
  ]);

  const api: DependencyStatus =
    apiResult.status === "fulfilled" ? apiResult.value : "degraded";
  const stellar: DependencyStatus =
    stellarResult.status === "fulfilled" ? stellarResult.value : "degraded";

  const overallStatus: "ok" | "degraded" =
    api === "ok" && stellar === "ok" ? "ok" : "degraded";

  const body: HealthResponse = {
    status: overallStatus,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    dependencies: { api, stellar },
  };

  return NextResponse.json(body, { status: 200 });
}
