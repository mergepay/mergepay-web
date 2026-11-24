import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as freighterApi from "@stellar/freighter-api";
import { loginWithWallet } from "./stellar";
import { api } from "./api";
import { useAuth as useAuthStore } from "./auth-store";
import {
  resetTelemetry,
  setTelemetryEnabled,
  setTelemetryProvider,
  type TelemetryEvent,
} from "./telemetry";

/**
 * SEP-10 login funnel instrumentation (#886): each stage is recorded, a
 * failure reports where the funnel dropped, and no event ever carries the
 * public key, challenge or signed XDR.
 */

vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  getAddress: vi.fn(),
  getNetworkDetails: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
}));

vi.mock("./api", () => ({
  api: {
    authChallenge: vi.fn(),
    authVerify: vi.fn(),
  },
}));

const PUBLIC_KEY = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const CHALLENGE_XDR = "AAAAAgAAAABi/B0L0JGythwN1lY0aypo19NHxvLCyO5tBEcCVvwF9wAAAGQAAAAAAAAAAQ==";

let events: TelemetryEvent[];

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.getState().clear();
  useAuthStore.getState().clearWalletError();
  resetTelemetry();
  setTelemetryEnabled(true);
  events = [];
  setTelemetryProvider({ track: (event) => events.push(event) });
});

afterEach(() => resetTelemetry());

describe("loginWithWallet telemetry", () => {
  it("records a not-installed failure at the connect stage", async () => {
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: false });

    await expect(loginWithWallet()).rejects.toThrow();

    expect(events.map((e) => e.name)).toEqual(["wallet_connect_started", "wallet_connect_failed"]);
    expect(events[1].properties).toMatchObject({ stage: "connect", errorCode: "not_installed" });
    expect(typeof events[1].properties.durationMs).toBe("number");
  });

  it("records the challenge, then where signing dropped, without leaking the key or XDR", async () => {
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighterApi.requestAccess).mockResolvedValue({ address: PUBLIC_KEY });
    vi.mocked(api.authChallenge).mockResolvedValue({
      transaction: CHALLENGE_XDR,
      networkPassphrase: "Test SDF Network ; September 2015",
    } as Awaited<ReturnType<typeof api.authChallenge>>);
    vi.mocked(freighterApi.signTransaction).mockRejectedValue(new Error(`User declined ${PUBLIC_KEY}`));

    await expect(loginWithWallet()).rejects.toThrow();

    const names = events.map((e) => e.name);
    expect(names).toContain("wallet_sep10_challenge_received");
    expect(names).not.toContain("wallet_sep10_challenge_signed");
    const failed = events.find((e) => e.name === "wallet_connect_failed");
    expect(failed?.properties.stage).toBe("sign");

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(PUBLIC_KEY);
    expect(serialized).not.toContain(CHALLENGE_XDR);
    expect(serialized).not.toContain("declined");
  });
});
