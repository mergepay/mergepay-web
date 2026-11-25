import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { GroupInviteModal, resolveInviteUrl } from "./GroupInviteModal";

const mutateAsync = vi.fn();

vi.mock("@/lib/queries", () => ({
  useCreateInvite: () => ({ mutateAsync, isPending: false }),
}));

// Render the real qrcode.react SVG synchronously instead of the code-split
// wrapper, so the test can inspect the encoded output.
vi.mock("@/components/ui/lazy-qr-code", async () => {
  const qr = await import("qrcode.react");
  return { QRCodeSVG: qr.QRCodeSVG, QRCodeCanvas: qr.QRCodeCanvas };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const INVITE = {
  id: "inv-1",
  groupId: "grp-1",
  code: "AbCdEf123456",
  url: "https://mergepay.app/join/AbCdEf123456?group=grp-1",
  expiresAt: null,
  maxUses: null,
  uses: 0,
  createdAt: "2026-11-24T00:00:00Z",
};

const writeText = vi.fn();

beforeEach(() => {
  mutateAsync.mockReset();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function renderModal(props: Partial<Parameters<typeof GroupInviteModal>[0]> = {}) {
  const onClose = vi.fn();
  render(
    <GroupInviteModal
      open
      onClose={onClose}
      groupId="grp-1"
      groupName="Lisbon trip"
      baseUrl="https://mergepay.app"
      {...props}
    />
  );
  return { onClose };
}

describe("GroupInviteModal", () => {
  it("generates an invite and renders a scannable QR code of the invite URL", async () => {
    mutateAsync.mockResolvedValue({ invite: INVITE });
    renderModal();

    expect(screen.getByRole("heading", { name: "Invite to Lisbon trip" })).toBeInTheDocument();
    const qr = await screen.findByTestId("group-invite-qr");
    expect(qr.tagName.toLowerCase()).toBe("svg");
    expect(qr).toHaveAttribute("aria-label", "QR code for the group invite link");
    // The SVG encodes modules as path data; a non-empty path means real output.
    expect(qr.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Invite link")).toHaveValue(INVITE.url);
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("copies the invite link with visual feedback that resets", async () => {
    mutateAsync.mockResolvedValue({ invite: INVITE });
    renderModal();
    await screen.findByTestId("group-invite-qr");

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));
    });
    expect(writeText).toHaveBeenCalledWith(INVITE.url);
    expect(screen.getByRole("button", { name: "Invite link copied" })).toHaveTextContent("Copied!");
    expect(screen.getByText("Invite link copied to clipboard")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2_500);
    });
    expect(screen.getByRole("button", { name: "Copy invite link" })).toHaveTextContent("Copy link");
  });

  it("disables copying until the link is ready", () => {
    mutateAsync.mockReturnValue(new Promise(() => {}));
    renderModal();
    expect(screen.getByRole("button", { name: "Copy invite link" })).toBeDisabled();
    expect(screen.getByText("Generating invite link…")).toBeInTheDocument();
    expect(screen.queryByTestId("group-invite-qr")).not.toBeInTheDocument();
  });

  it("shows recovery guidance and retries when invite creation fails", async () => {
    mutateAsync.mockRejectedValueOnce({ status: 503 });
    renderModal();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not reach the invite service/i);

    mutateAsync.mockResolvedValueOnce({ invite: INVITE });
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await screen.findByTestId("group-invite-qr");
    expect(mutateAsync).toHaveBeenCalledTimes(2);
  });

  it("does not request an invite while closed", () => {
    renderModal({ open: false });
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

describe("resolveInviteUrl", () => {
  it("keeps a safe API share URL", () => {
    expect(resolveInviteUrl(INVITE, "grp-1", "https://mergepay.app")).toBe(INVITE.url);
  });

  it("rebuilds the canonical join link when the API URL is unsafe", () => {
    expect(
      resolveInviteUrl({ code: INVITE.code, url: "javascript:alert(1)" }, "grp-1", "https://mergepay.app")
    ).toBe("https://mergepay.app/join/AbCdEf123456?group=grp-1");
  });

  it("returns null when nothing safe can be produced", () => {
    expect(resolveInviteUrl({ code: "../../x", url: "" }, "grp-1", "https://mergepay.app")).toBeNull();
    expect(resolveInviteUrl({ code: INVITE.code, url: "" }, "grp-1", undefined)).toBeNull();
  });
});

