import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  qk,
  useRemoveMember,
  useTreasuryDeposit,
  useTreasuryWithdraw,
  useUpdateMemberRole,
} from "@/lib/queries";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    treasuryDeposit: vi.fn(),
    treasuryWithdraw: vi.fn(),
    removeMember: vi.fn(),
    updateMemberRole: vi.fn(),
  },
  getInviteByCode: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const GROUP = "group-1";
const OTHER = "group-2";

/**
 * Render `hook` against a cache pre-seeded with `keys`, and hand back the
 * client so tests can read `isInvalidated` straight off the query state —
 * the same signal React Query uses to decide whether to refetch.
 */
function seedAndRender<T>(
  hook: () => T,
  keys: readonly (readonly unknown[])[]
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const key of keys) qc.setQueryData(key, { seeded: true });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "QueryWrapper";
  const { result } = renderHook(hook, { wrapper: Wrapper });
  return { result, qc };
}

const invalidated = (qc: QueryClient, key: readonly unknown[]) =>
  qc.getQueryState(key)?.isInvalidated;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useTreasuryDeposit / useTreasuryWithdraw (#526)", () => {
  const deposit = { amount: "10", assetCode: "XLM" };

  it("refreshes the treasury balance and history after a deposit", async () => {
    vi.mocked(api.treasuryDeposit).mockResolvedValue({ ok: true } as never);
    const { result, qc } = seedAndRender(
      () => useTreasuryDeposit(GROUP),
      [qk.treasury(GROUP), qk.treasuryHistory(GROUP)]
    );

    await act(async () => {
      await result.current.mutateAsync(deposit);
    });

    expect(invalidated(qc, qk.treasury(GROUP))).toBe(true);
    expect(invalidated(qc, qk.treasuryHistory(GROUP))).toBe(true);
  });

  it("refreshes the dashboard aggregate the same money moved into", async () => {
    vi.mocked(api.treasuryDeposit).mockResolvedValue({ ok: true } as never);
    const aggregateKey = [...qk.treasuryAggregate, [GROUP, OTHER]];
    const { result, qc } = seedAndRender(() => useTreasuryDeposit(GROUP), [aggregateKey]);

    await act(async () => {
      await result.current.mutateAsync(deposit);
    });

    expect(invalidated(qc, aggregateKey)).toBe(true);
  });

  it("refreshes the aggregate after a withdrawal too", async () => {
    vi.mocked(api.treasuryWithdraw).mockResolvedValue({ ok: true } as never);
    const aggregateKey = [...qk.treasuryAggregate, [GROUP]];
    const { result, qc } = seedAndRender(() => useTreasuryWithdraw(GROUP), [aggregateKey]);

    await act(async () => {
      await result.current.mutateAsync({ ...deposit, destination: "GDEST" });
    });

    expect(invalidated(qc, aggregateKey)).toBe(true);
  });

  it("leaves another group's treasury cached", async () => {
    vi.mocked(api.treasuryDeposit).mockResolvedValue({ ok: true } as never);
    const { result, qc } = seedAndRender(() => useTreasuryDeposit(GROUP), [
      qk.treasury(OTHER),
      qk.treasuryHistory(OTHER),
    ]);

    await act(async () => {
      await result.current.mutateAsync(deposit);
    });

    expect(invalidated(qc, qk.treasury(OTHER))).toBe(false);
    expect(invalidated(qc, qk.treasuryHistory(OTHER))).toBe(false);
  });
});

describe("member mutations (#526)", () => {
  it("drops the removed member from balances, ledger and suggestions", async () => {
    vi.mocked(api.removeMember).mockResolvedValue({ ok: true } as never);
    const subtree = [
      qk.balances(GROUP),
      qk.ledger(GROUP),
      qk.activity(GROUP),
      [...qk.expenses(GROUP), "page", 20, null],
    ];
    const { result, qc } = seedAndRender(() => useRemoveMember(GROUP), subtree);

    await act(async () => {
      await result.current.mutateAsync("member-9");
    });

    for (const key of subtree) expect(invalidated(qc, key)).toBe(true);
  });

  it("refreshes the group list row that shows memberCount and my role", async () => {
    vi.mocked(api.removeMember).mockResolvedValue({ ok: true } as never);
    vi.mocked(api.updateMemberRole).mockResolvedValue({ ok: true } as never);

    const remove = seedAndRender(() => useRemoveMember(GROUP), [qk.groups]);
    await act(async () => {
      await remove.result.current.mutateAsync("member-9");
    });
    expect(invalidated(remove.qc, qk.groups)).toBe(true);

    const promote = seedAndRender(() => useUpdateMemberRole(GROUP), [qk.groups]);
    await act(async () => {
      await promote.result.current.mutateAsync({ memberId: "member-2", role: "admin" });
    });
    expect(invalidated(promote.qc, qk.groups)).toBe(true);
  });

  it("does not sweep other groups when one member changes", async () => {
    vi.mocked(api.updateMemberRole).mockResolvedValue({ ok: true } as never);
    const { result, qc } = seedAndRender(() => useUpdateMemberRole(GROUP), [
      qk.balances(OTHER),
      qk.expenses(OTHER),
      qk.ledger(OTHER),
    ]);

    await act(async () => {
      await result.current.mutateAsync({ memberId: "member-2", role: "member" });
    });

    expect(invalidated(qc, qk.balances(OTHER))).toBe(false);
    expect(invalidated(qc, qk.expenses(OTHER))).toBe(false);
    expect(invalidated(qc, qk.ledger(OTHER))).toBe(false);
  });
});
