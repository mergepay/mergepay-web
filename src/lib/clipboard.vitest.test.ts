import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./clipboard";

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("copyTextToClipboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the async clipboard API when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    await expect(copyTextToClipboard("invite-link")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("invite-link");
  });

  it("falls back to execCommand when the async API rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    setClipboard({ writeText });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    await expect(copyTextToClipboard("invite-link")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenCalledWith("copy");
    // The temporary textarea must not be left behind in the DOM.
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back when the clipboard API is missing entirely", async () => {
    setClipboard(undefined);
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    await expect(copyTextToClipboard("code")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("reports failure instead of throwing when every path is unavailable", async () => {
    setClipboard(undefined);
    // @ts-expect-error — simulate a runtime without execCommand.
    document.execCommand = undefined;

    await expect(copyTextToClipboard("code")).resolves.toBe(false);
  });

  it("reports failure when execCommand reports it could not copy", async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn().mockReturnValue(false);

    await expect(copyTextToClipboard("code")).resolves.toBe(false);
  });
});
