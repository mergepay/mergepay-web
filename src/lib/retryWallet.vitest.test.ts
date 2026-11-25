import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  retryWallet,
  WalletError,
  WalletNetworkError,
  WalletLockedError,
  UserRejectedError,
  WalletNotInstalledError,
  NetworkMismatchError,
  classifyAuthVerify,
  isSessionToken,
} from "./stellar";

describe("retryWallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the result on first attempt when fn succeeds", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await retryWallet(fn);
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient network errors with exponential backoff", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new WalletNetworkError("Network timeout"))
      .mockResolvedValueOnce("recovered");

    const result = await retryWallet(fn, { maxRetries: 3, retryDelayMs: 10 });

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on unknown errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("something weird"))
      .mockResolvedValueOnce("ok");

    const result = await retryWallet(
      fn,
      { maxRetries: 3, retryDelayMs: 10 },
      { retryOn: ["network", "unknown", "disconnected"] }
    );

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry locked wallet errors (non-retryable)", async () => {
    const fn = vi.fn().mockRejectedValue(new WalletLockedError());

    await expect(retryWallet(fn, { maxRetries: 3, retryDelayMs: 10 })).rejects.toThrow(
      WalletLockedError
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry user_rejected errors (non-retryable)", async () => {
    const fn = vi.fn().mockRejectedValue(new UserRejectedError());

    await expect(retryWallet(fn, { maxRetries: 3, retryDelayMs: 10 })).rejects.toThrow(
      UserRejectedError
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry not_installed errors (non-retryable)", async () => {
    const fn = vi.fn().mockRejectedValue(new WalletNotInstalledError());

    await expect(retryWallet(fn, { maxRetries: 3, retryDelayMs: 10 })).rejects.toThrow(
      WalletNotInstalledError
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry network_mismatch errors (non-retryable)", async () => {
    const fn = vi.fn().mockRejectedValue(new NetworkMismatchError("Testnet"));

    await expect(retryWallet(fn, { maxRetries: 3, retryDelayMs: 10 })).rejects.toThrow(
      NetworkMismatchError
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting maxRetries on transient failures", async () => {
    const fn = vi.fn().mockRejectedValue(new WalletNetworkError("Still down"));

    await expect(
      retryWallet(fn, { maxRetries: 2, retryDelayMs: 10 })
    ).rejects.toThrow(WalletNetworkError);
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("respects custom retryOn config — only retries listed codes", async () => {
    const fn = vi.fn().mockRejectedValue(new WalletLockedError());

    await expect(
      retryWallet(
        fn,
        { maxRetries: 3, retryDelayMs: 10 },
        { retryOn: ["network"] }
      )
    ).rejects.toThrow(WalletLockedError);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries disconnected errors when included in retryOn", async () => {
    const disconnectedErr = new WalletError(
      "Wallet connection was lost.",
      "disconnected"
    );
    const fn = vi
      .fn()
      .mockRejectedValueOnce(disconnectedErr)
      .mockResolvedValueOnce("connected");

    const result = await retryWallet(
      fn,
      { maxRetries: 3, retryDelayMs: 10 },
      { retryOn: ["disconnected", "network"] }
    );

    expect(result).toBe("connected");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("classifyAuthVerify — null safety", () => {
  it("classifies a valid token in body as 'valid'", () => {
    expect(
      classifyAuthVerify({
        header: null,
        body: { token: "valid_JWT.token_123" },
      })
    ).toBe("valid");
  });

  it("classifies an invalid token in body as 'invalid'", () => {
    expect(
      classifyAuthVerify({
        header: null,
        body: { token: "not a jwt" },
      })
    ).toBe("invalid");
  });

  it("classifies a header-based auth as 'valid'", () => {
    expect(
      classifyAuthVerify({
        header: { authorization: "Bearer some_jwt_token" },
        body: null,
      })
    ).toBe("valid");
  });

  it("classifies empty envelope as 'empty'", () => {
    // When header is null and body is null, neither branch matches
    // and the function returns 'empty'. The type system prevents this
    // at call sites, but the function handles it defensively.
    const envelope = { header: null, body: null } as unknown as Parameters<typeof classifyAuthVerify>[0];
    expect(classifyAuthVerify(envelope)).toBe("empty");
  });
});

describe("isSessionToken", () => {
  it("accepts a valid JWT-like string (with dots)", () => {
    expect(isSessionToken("eyJhbGci.eyJzdWIi.SflKxwRJ")).toBe(true);
  });

  it("accepts a valid base64url string (without dots)", () => {
    expect(isSessionToken("eyJhbGci_eyJzdWIi_SflKxwRJ")).toBe(true);
  });

  it("rejects non-string values", () => {
    expect(isSessionToken(null)).toBe(false);
    expect(isSessionToken(undefined)).toBe(false);
    expect(isSessionToken(123)).toBe(false);
    expect(isSessionToken({})).toBe(false);
  });

  it("rejects strings with invalid characters", () => {
    expect(isSessionToken("has spaces")).toBe(false);
    expect(isSessionToken("has/slashes")).toBe(false);
  });
});
