import { describe, it, expect, vi, afterEach } from "vitest";
import { checkHorizonHealth } from "./HorizonHealthIndicator";

describe("HorizonHealthIndicator checkHorizonHealth (#637)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns healthy status when Horizon responds with HTTP 200 promptly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ horizon_version: "2.0.0" }), { status: 200 })
    );
    const result = await checkHorizonHealth();
    expect(result.status).toBe("healthy");
    expect(typeof result.latencyMs).toBe("number");
  });

  it("returns degraded status when Horizon responds with a non-OK HTTP status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Service Unavailable", { status: 503 })
    );
    const result = await checkHorizonHealth();
    expect(result.status).toBe("degraded");
  });

  it("returns offline status when the network request rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network down"));
    const result = await checkHorizonHealth();
    expect(result.status).toBe("offline");
    expect(result.latencyMs).toBeNull();
  });
});
