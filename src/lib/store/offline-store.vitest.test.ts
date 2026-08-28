import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  draftAfterSync,
  pendingDrafts,
  useOfflineStore,
  type OfflineDraft,
} from "./offlineStore";
import { runOfflineSync } from "@/lib/offlineSync";

vi.mock("@/lib/api", () => ({
  api: { createExpense: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function makeDraft(overrides: Partial<OfflineDraft> = {}): OfflineDraft {
  return {
    localId: overrides.localId ?? `local-${Math.random().toString(36).slice(2)}`,
    groupId: overrides.groupId ?? "group-1",
    request: {
      title: "Dinner",
      amount: "25",
      assetCode: "XLM",
      splitType: "equal",
      shares: [{ userId: "u1" }],
      idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
      ...(overrides.request ?? {}),
    },
    createdAt: overrides.createdAt ?? Date.now(),
    status: overrides.status ?? "pending",
  };
}

describe("offline draft queue store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useOfflineStore.setState({
      isOnline: true,
      drafts: [],
      lastAttemptAt: null,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues a draft with a local id and an idempotency key", () => {
    const localId = useOfflineStore
      .getState()
      .enqueue("group-1", { title: "Taxi", amount: "8", assetCode: "XLM", splitType: "equal", shares: [{ userId: "u1" }] });

    const draft = useOfflineStore.getState().drafts[0];
    expect(draft.localId).toBe(localId);
    expect(draft.request.idempotencyKey).toBeTruthy();
    expect(draft.status).toBe("pending");
  });

  it("does not enqueue the same request twice (dedupe by idempotency key)", () => {
    const store = useOfflineStore.getState();
    const first = store.enqueue("group-1", {
      title: "Taxi",
      amount: "8",
      assetCode: "XLM",
      splitType: "equal",
      shares: [{ userId: "u1" }],
      idempotencyKey: "dup-key",
    });
    const second = useOfflineStore.getState().enqueue("group-1", {
      title: "Taxi",
      amount: "8",
      assetCode: "XLM",
      splitType: "equal",
      shares: [{ userId: "u1" }],
      idempotencyKey: "dup-key",
    });

    expect(second).toBe(first);
    expect(useOfflineStore.getState().drafts).toHaveLength(1);
  });

  it("keeps a provided idempotency key when one was supplied", () => {
    useOfflineStore.getState().enqueue("group-1", {
      title: "Taxi",
      amount: "8",
      assetCode: "XLM",
      splitType: "equal",
      shares: [{ userId: "u1" }],
      idempotencyKey: "client-key",
    });
    expect(useOfflineStore.getState().drafts[0].request.idempotencyKey).toBe(
      "client-key"
    );
  });

  it("pendingDrafts returns retryable drafts oldest-first", () => {
    const older = makeDraft({ createdAt: 100, status: "failed" });
    const middle = makeDraft({ createdAt: 200, status: "pending" });
    const newer = makeDraft({ createdAt: 300, status: "syncing" });
    const queued = pendingDrafts([newer, middle, older]);
    expect(queued.map((d) => d.createdAt)).toEqual([100, 200]);
  });

  it("draftAfterSync removes a draft on success and marks it failed on failure", () => {
    const a = makeDraft({ localId: "a" });
    const b = makeDraft({ localId: "b" });
    const afterOk = draftAfterSync([a, b], "a", true);
    expect(afterOk.map((d) => d.localId)).toEqual(["b"]);
    const afterFail = draftAfterSync([a, b], "b", false);
    expect(afterFail.find((d) => d.localId === "b")?.status).toBe("failed");
  });
});

describe("runOfflineSync", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useOfflineStore.setState({
      isOnline: true,
      drafts: [],
      lastAttemptAt: null,
    });
    vi.clearAllMocks();
  });

  it("posts drafts sequentially and removes them on success", async () => {
    vi.mocked(api.createExpense).mockResolvedValue({ expense: {} as never });
    useOfflineStore
      .getState()
      .enqueue("group-1", { title: "One", amount: "1", assetCode: "XLM", splitType: "equal", shares: [{ userId: "u1" }] });
    useOfflineStore
      .getState()
      .enqueue("group-1", { title: "Two", amount: "2", assetCode: "XLM", splitType: "equal", shares: [{ userId: "u1" }] });

    const result = await runOfflineSync();

    expect(result).toEqual({ synced: 2, failed: 0 });
    expect(api.createExpense).toHaveBeenCalledTimes(2);
    expect(useOfflineStore.getState().drafts).toHaveLength(0);
    expect(toast.success).toHaveBeenCalledTimes(2);
  });

  it("marks a failing draft failed and keeps syncing the rest", async () => {
    vi.mocked(api.createExpense)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ expense: {} as never });
    useOfflineStore
      .getState()
      .enqueue("group-1", { title: "Bad", amount: "1", assetCode: "XLM", splitType: "equal", shares: [{ userId: "u1" }] });
    useOfflineStore
      .getState()
      .enqueue("group-1", { title: "Good", amount: "2", assetCode: "XLM", splitType: "equal", shares: [{ userId: "u1" }] });

    const result = await runOfflineSync();

    expect(result).toEqual({ synced: 1, failed: 1 });
    const remaining = useOfflineStore.getState().drafts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].request.title).toBe("Bad");
    expect(remaining[0].status).toBe("failed");
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("does nothing while offline", async () => {
    useOfflineStore.setState({ isOnline: false });
    const result = await runOfflineSync();
    expect(result).toEqual({ synced: 0, failed: 0 });
    expect(api.createExpense).not.toHaveBeenCalled();
  });

  it("never runs two passes concurrently", async () => {
    let release!: () => void;
    vi.mocked(api.createExpense).mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ expense: {} as never });
      })
    );
    useOfflineStore
      .getState()
      .enqueue("group-1", { title: "One", amount: "1", assetCode: "XLM", splitType: "equal", shares: [{ userId: "u1" }] });

    const first = runOfflineSync();
    const second = await runOfflineSync();
    expect(second).toEqual({ synced: 0, failed: 0 });

    release();
    await first;
    expect(api.createExpense).toHaveBeenCalledTimes(1);
    expect(useOfflineStore.getState().drafts).toHaveLength(0);
  });
});
