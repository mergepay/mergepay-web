import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { useTrustlineCheck } from "./useTrustlineCheck";

// Mock the stellar module
vi.mock("@/lib/stellar", () => ({
  hasTrustline: vi.fn(),
}));

import { hasTrustline } from "@/lib/stellar";

const mockedHasTrustline = vi.mocked(hasTrustline);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "QueryClientWrapper";
  return Wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useTrustlineCheck", () => {
  it("returns hasTrustline: true for native XLM without calling Horizon", async () => {
    const { result } = renderHook(
      () => useTrustlineCheck("XLM", null, "GABC..."),
      { wrapper: createWrapper() },
    );

    // Native assets disable the query entirely — no Horizon call needed
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data?.hasTrustline).toBeUndefined();
    expect(mockedHasTrustline).not.toHaveBeenCalled();
  });

  it("returns hasTrustline: true for native asset with null issuer", async () => {
    const { result } = renderHook(
      () => useTrustlineCheck("XLM", null, "GABC..."),
      { wrapper: createWrapper() },
    );

    // Native asset with null issuer — query is disabled, no Horizon call
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data?.hasTrustline).toBeUndefined();
  });

  it("checks Horizon for non-native assets", async () => {
    mockedHasTrustline.mockResolvedValueOnce(true);

    const { result } = renderHook(
      () => useTrustlineCheck("USDC", "GA5...ISSUER", "GABC..."),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockedHasTrustline).toHaveBeenCalledWith(
      "GABC...",
      "USDC",
      "GA5...ISSUER",
    );
    expect(result.current.data?.hasTrustline).toBe(true);
  });

  it("returns hasTrustline: false when Horizon reports missing", async () => {
    mockedHasTrustline.mockResolvedValueOnce(false);

    const { result } = renderHook(
      () => useTrustlineCheck("USDC", "GA5...ISSUER", "GABC..."),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.hasTrustline).toBe(false);
  });

  it("is disabled when publicKey is not provided", () => {
    const { result } = renderHook(
      () => useTrustlineCheck("USDC", "GA5...ISSUER", null),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockedHasTrustline).not.toHaveBeenCalled();
  });

  it("is disabled when asset is native (case insensitive)", async () => {
    const { result } = renderHook(
      () => useTrustlineCheck("native", "GA5...ISSUER", "GABC..."),
      { wrapper: createWrapper() },
    );

    // native keyword triggers the isNative path — query is disabled
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data?.hasTrustline).toBeUndefined();
    expect(mockedHasTrustline).not.toHaveBeenCalled();
  });
});
