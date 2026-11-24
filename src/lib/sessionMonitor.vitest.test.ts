import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAssetStore } from "./asset-store";
import { useAuth } from "./auth-store";
import { useGroupStore } from "./group-store";
import {
  clearClientSession,
  emitSessionExpired,
  isUnauthorizedStatus,
  subscribeToSessionExpired,
} from "./sessionMonitor";
import type { User } from "./types";

const user: User = {
  id: "user-1",
  stellarPublicKey: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  displayName: "Ada",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function resetStores() {
  useAuth.getState().forgetWallet();
  useGroupStore.getState().clear();
  useAssetStore.getState().resetActiveAsset();
}

describe("session monitor (#898)", () => {
  beforeEach(resetStores);
  afterEach(() => {
    resetStores();
    vi.restoreAllMocks();
  });

  it("treats only 401 as an authentication failure", () => {
    expect(isUnauthorizedStatus(401)).toBe(true);
    expect(isUnauthorizedStatus(403)).toBe(false);
    expect(isUnauthorizedStatus(500)).toBe(false);
    expect(isUnauthorizedStatus(0)).toBe(false);
  });

  it("clears the auth, group and asset stores together", () => {
    useAuth.getState().setSession("jwt-token", user);
    useGroupStore.getState().setSelectedGroup("group-42");
    useAssetStore.getState().setActiveAsset({ code: "USDC", issuer: "GUSDC" });

    expect(useAuth.getState().token).toBe("jwt-token");
    expect(useGroupStore.getState().recentGroupIds).toContain("group-42");

    clearClientSession();

    expect(useAuth.getState().token).toBeNull();
    expect(useAuth.getState().user).toBeNull();
    expect(useAuth.getState().lastAuthenticatedAt).toBeNull();
    expect(useGroupStore.getState().selectedGroupId).toBeNull();
    expect(useGroupStore.getState().recentGroupIds).toEqual([]);
    expect(useAssetStore.getState().activeAsset).toEqual({
      code: "XLM",
      issuer: null,
    });
  });

  it("announces the expiry reason to subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSessionExpired(listener);

    emitSessionExpired("token_expired");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ reason: "token_expired" });

    unsubscribe();
    emitSessionExpired("idle_timeout");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
