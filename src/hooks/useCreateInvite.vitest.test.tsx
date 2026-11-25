/**
 * Integration tests for the optimistic invite path of `useCreateInvite` (#812).
 *
 * Covers:
 *  - a pending invite is appended before the API answers
 *  - the placeholder is reconciled with the server's invite on success
 *  - the group detail snapshot is restored when the request fails
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCreateInvite, qk } from "@/lib/queries";
import { api } from "@/lib/api";
import type { GroupDetail, Invite, User } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: {
    createInvite: vi.fn(),
    deleteExpense: vi.fn(),
    listGroups: vi.fn(),
    me: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const ALICE: User = {
  id: "user-1",
  stellarPublicKey: "GALICE",
  displayName: "Alice",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function groupDetail(): GroupDetail {
  return {
    group: {
      id: "grp-1",
      name: "Trip",
      description: null,
      createdByUserId: ALICE.id,
      treasuryEnabled: false,
      treasuryAccountPublicKey: null,
      treasuryRequiredSigners: null,
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    members: [
      {
        id: "mem-1",
        groupId: "grp-1",
        userId: ALICE.id,
        role: "admin",
        joinedAt: "2026-01-01T00:00:00.000Z",
        user: ALICE,
      },
    ],
    yourRole: "admin",
  };
}

const SERVER_INVITE: Invite = {
  id: "inv-1",
  groupId: "grp-1",
  code: "ABCD1234",
  url: "https://mergepay.app/join/ABCD1234?group=grp-1",
  expiresAt: "2026-02-01T00:00:00.000Z",
  maxUses: 5,
  uses: 0,
  createdAt: "2026-01-15T00:00:00.000Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createWrapper(client: QueryClient) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "QueryWrapper";
  return Wrapper;
}

describe("useCreateInvite — optimistic pending members (#812)", () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    client.clear();
  });

  it("appends a pending invite before the API responds", async () => {
    client.setQueryData<GroupDetail>(qk.group("grp-1"), groupDetail());
    const gate = deferred<{ invite: Invite }>();
    vi.mocked(api.createInvite).mockReturnValue(gate.promise);

    const { result } = renderHook(() => useCreateInvite("grp-1"), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.mutate({ maxUses: 5, expiresInHours: 24 });
    });

    await waitFor(() => {
      const detail = client.getQueryData<GroupDetail>(qk.group("grp-1"));
      expect(detail?.pendingInvites).toHaveLength(1);
      expect(detail?.pendingInvites?.[0].pending).toBe(true);
      expect(detail?.pendingInvites?.[0].code).toBeNull();
      expect(detail?.pendingInvites?.[0].maxUses).toBe(5);
    });

    await act(async () => {
      gate.resolve({ invite: SERVER_INVITE });
    });
  });

  it("replaces the placeholder with the server's invite once it succeeds", async () => {
    client.setQueryData<GroupDetail>(qk.group("grp-1"), groupDetail());
    vi.mocked(api.createInvite).mockResolvedValue({ invite: SERVER_INVITE });

    const { result } = renderHook(() => useCreateInvite("grp-1"), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({});
    });

    const detail = client.getQueryData<GroupDetail>(qk.group("grp-1"));
    expect(detail?.pendingInvites).toHaveLength(1);
    expect(detail?.pendingInvites?.[0]).toMatchObject({
      id: "inv-1",
      code: "ABCD1234",
      pending: false,
    });
  });

  it("restores the group detail when the request fails", async () => {
    client.setQueryData<GroupDetail>(qk.group("grp-1"), groupDetail());
    const gate = deferred<{ invite: Invite }>();
    vi.mocked(api.createInvite).mockReturnValue(gate.promise);

    const { result } = renderHook(() => useCreateInvite("grp-1"), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.mutate({});
    });

    await waitFor(() => {
      const detail = client.getQueryData<GroupDetail>(qk.group("grp-1"));
      expect(detail?.pendingInvites).toHaveLength(1);
    });

    await act(async () => {
      gate.reject(new Error("network down"));
    });

    await waitFor(() => {
      const detail = client.getQueryData<GroupDetail>(qk.group("grp-1"));
      expect(detail?.pendingInvites).toBeUndefined();
      expect(detail?.members).toHaveLength(1);
    });
  });

  it("does not throw when the group detail is not cached yet", async () => {
    vi.mocked(api.createInvite).mockResolvedValue({ invite: SERVER_INVITE });

    const { result } = renderHook(() => useCreateInvite("grp-1"), {
      wrapper: createWrapper(client),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({});
      })
    ).resolves.not.toThrow();
  });
});
