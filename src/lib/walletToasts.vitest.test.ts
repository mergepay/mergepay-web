import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  showWalletErrorToast,
  walletRemediationDescription,
  walletRemediationToast,
} from "./walletToasts";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("walletRemediationDescription", () => {
  it("names the unlock step for a locked wallet", () => {
    expect(walletRemediationDescription("locked")).toBe(
      "Please unlock Freighter and try again."
    );
  });

  it("names the install step for a missing extension", () => {
    expect(walletRemediationDescription("not_installed")).toMatch(
      /install it, then reconnect/i
    );
  });

  it("stays silent when the failure message already says what happened", () => {
    // Retrying a cancelled request, a network error or a mismatch does not
    // need a second line — those messages already carry the instruction.
    expect(walletRemediationDescription("user_rejected")).toBeNull();
    expect(walletRemediationDescription("disconnected")).toBeNull();
    expect(walletRemediationDescription("network")).toBeNull();
    expect(walletRemediationDescription("network_mismatch")).toBeNull();
    expect(walletRemediationDescription("unknown")).toBeNull();
  });
});

describe("walletRemediationToast", () => {
  it("offers a one-click install only when the extension is missing", () => {
    expect(walletRemediationToast("not_installed")?.action).toMatchObject({
      label: "Get Freighter",
    });
    expect(walletRemediationToast("locked")?.action).toBeUndefined();
  });

  it("keeps the toast up long enough to read and act on", () => {
    expect(walletRemediationToast("locked")?.duration).toBeGreaterThanOrEqual(
      8000
    );
    expect(walletRemediationToast("user_rejected")).toBeNull();
  });
});

describe("showWalletErrorToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attaches the remediation line to a locked-wallet error", () => {
    showWalletErrorToast("locked", "Your Freighter wallet is locked.");

    expect(toast.error).toHaveBeenCalledTimes(1);
    const [message, options] = vi.mocked(toast.error).mock.calls[0];
    expect(message).toBe("Your Freighter wallet is locked.");
    expect(options?.description).toBe(
      "Please unlock Freighter and try again."
    );
  });

  it("distinguishes a missing extension from a locked wallet", () => {
    showWalletErrorToast(
      "not_installed",
      "Stellar Freighter extension not found."
    );

    const [message, options] = vi.mocked(toast.error).mock.calls[0];
    expect(message).toMatch(/not found/i);
    expect(options?.description).toMatch(/install it, then reconnect/i);
    expect(options?.description).not.toMatch(/unlock/i);
  });

  it("passes a plain message through untouched when nothing needs adding", () => {
    showWalletErrorToast("user_rejected", "You cancelled the request.");

    expect(toast.warning).toHaveBeenCalledWith(
      "You cancelled the request.",
      { duration: 5000 }
    );
  });
});
