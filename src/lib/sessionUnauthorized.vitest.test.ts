import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "./types";
import { useAuth } from "./auth-store";
import { useWalletStore } from "./wallet-store";
import {
  api,
  isSessionExpired,
  resetSessionExpired,
  setSessionExpiredHandler,
} from "./api";

const USER: User = {
  id: "user-1",
  stellarPublicKey: "GABC",
  displayName: "Ada",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(handler(String(input), init))
    )
  );
}

describe("401 session refresh and expiry", () => {
  afterEach(() => {
    setSessionExpiredHandler(null);
    resetSessionExpired();
    useAuth.getState().forgetWallet();
    useWalletStore.getState().setConnected(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("refreshes once and retries the original request with the new token", async () => {
    useAuth.getState().setSession("live-token", USER);
    useWalletStore.getState().setConnected(true);
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);

    const authorizations: string[] = [];
    installFetch((url, init) => {
      if (url.endsWith("/api/auth/refresh")) {
        return json({ token: "refreshed-token", user: USER }, 200);
      }
      authorizations.push(new Headers(init?.headers).get("authorization") ?? "");
      if (authorizations.length === 1) return json({ error: "expired" }, 401);
      return json({ groups: [] }, 200);
    });

    await expect(api.listGroups()).resolves.toEqual({ groups: [] });

    expect(authorizations).toEqual([
      "Bearer live-token",
      "Bearer refreshed-token",
    ]);
    expect(useAuth.getState().token).toBe("refreshed-token");
    expect(useAuth.getState().sessionExpired).toBe(false);
    expect(isSessionExpired()).toBe(false);
    expect(useWalletStore.getState().isConnected).toBe(true);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("clears auth and wallet state once when refresh also returns 401", async () => {
    useAuth.getState().setSession("live-token", USER);
    useWalletStore.getState().setConnected(true);
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);

    let refreshCalls = 0;
    let releaseRefresh: () => void = () => {};
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    installFetch(async (url) => {
      if (url.endsWith("/api/auth/refresh")) {
        refreshCalls += 1;
        await refreshGate;
        return json({ error: "expired" }, 401);
      }
      return json({ error: "expired" }, 401);
    });

    const pending = Promise.allSettled([api.listGroups(), api.listGroups()]);
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    releaseRefresh();
    const results = await pending;

    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(useAuth.getState().token).toBeNull();
    expect(useAuth.getState().user).toBeNull();
    expect(useAuth.getState().sessionExpired).toBe(true);
    expect(isSessionExpired()).toBe(true);
    expect(useWalletStore.getState().isConnected).toBe(false);

    onExpired.mockClear();
    await expect(api.listGroups()).rejects.toMatchObject({ status: 401 });
    expect(onExpired).not.toHaveBeenCalled();
    expect(refreshCalls).toBe(1);
  });

  it("does not treat an anonymous 401 as an expired session", async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    installFetch(() => json({ error: "bad signature" }, 401));

    await expect(api.authChallenge("GABC")).rejects.toMatchObject({ status: 401 });

    expect(onExpired).not.toHaveBeenCalled();
    expect(useAuth.getState().sessionExpired).toBe(false);
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  });

  it("ends the session when /auth/refresh itself is rejected, without refreshing again", async () => {
    useAuth.getState().setSession("live-token", USER);
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    installFetch(() => json({ error: "expired" }, 401));

    await expect(api.authRefresh()).rejects.toMatchObject({ status: 401 });

    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe("/api/auth/refresh");
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(useAuth.getState().sessionExpired).toBe(true);
    expect(useAuth.getState().token).toBeNull();
  });

  it("ignores a 401 from a request whose token was already replaced", async () => {
    useAuth.getState().setSession("old-token", USER);
    let resolveGroups: (response: Response) => void = () => {};
    const groupsResponse = new Promise<Response>((resolve) => {
      resolveGroups = resolve;
    });
    installFetch((url) => {
      if (url.includes("/api/groups")) return groupsResponse;
      return json({ token: "should-not-refresh" }, 200);
    });

    const pending = api.listGroups();
    useAuth.getState().setSession("new-token", USER);
    resolveGroups(json({ error: "expired" }, 401));

    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(useAuth.getState().token).toBe("new-token");
    expect(useAuth.getState().sessionExpired).toBe(false);
    expect(vi.mocked(fetch).mock.calls.map((call) => String(call[0]))).toEqual([
      "/api/groups",
    ]);
  });

  it("clears the session from createExpense and listExpensesPage 401s", async () => {
    installFetch((url) => {
      if (url.endsWith("/api/auth/refresh")) return json({ error: "expired" }, 401);
      return json({ error: "expired" }, 401);
    });

    useAuth.getState().setSession("live-token", USER);
    const onCreate = vi.fn();
    setSessionExpiredHandler(onCreate);
    await expect(
      api.createExpense("group-1", {
        title: "Dinner",
        amount: "10.00",
        assetCode: "USDC",
        splitType: "equal",
        shares: [{ userId: USER.id }],
      })
    ).rejects.toMatchObject({ status: 401 });
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(useAuth.getState().sessionExpired).toBe(true);

    resetSessionExpired();
    useAuth.getState().setSession("live-token", USER);
    const onPage = vi.fn();
    setSessionExpiredHandler(onPage);
    await expect(api.listExpensesPage("group-1")).rejects.toMatchObject({
      status: 401,
    });
    expect(onPage).toHaveBeenCalledTimes(1);
    expect(useWalletStore.getState().isConnected).toBe(false);
  });
});
