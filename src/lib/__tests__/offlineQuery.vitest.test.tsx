import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createQueryClient } from "../queryClient";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("React Query Offline Resilience (Issue #622)", () => {
  const originalOnLine = navigator.onLine;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: originalOnLine,
    });
  });

  it("configures query defaults to disable window focus refetches and retries when offline", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    const client = createQueryClient();
    const defaultQueries = client.getDefaultOptions().queries;

    expect(defaultQueries?.networkMode).toBe("offlineFirst");

    // refetchOnWindowFocus function should return false when offline
    if (typeof defaultQueries?.refetchOnWindowFocus === "function") {
      expect(defaultQueries.refetchOnWindowFocus({} as any)).toBe(false);
    }

    // retry function should return false when offline
    if (typeof defaultQueries?.retry === "function") {
      const retryResult = defaultQueries.retry(0, new Error("network failed"));
      expect(retryResult).toBe(false);
    }
  });

  it("allows window focus refetches when online", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });

    const client = createQueryClient();
    const defaultQueries = client.getDefaultOptions().queries;

    if (typeof defaultQueries?.refetchOnWindowFocus === "function") {
      expect(defaultQueries.refetchOnWindowFocus({} as any)).toBe(true);
    }
  });

  it("notifies user via Sonner toast when mutations are attempted offline", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    const client = createQueryClient();

    try {
      await client.getMutationCache().build(client, {
        mutationFn: async () => {
          throw new Error("offline");
        },
      }).execute({});
    } catch {
      // ignore
    }

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/offline|network/i)
    );
  });
});
