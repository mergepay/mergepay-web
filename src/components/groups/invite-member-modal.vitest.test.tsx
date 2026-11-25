import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { InviteMemberModal } from "./InviteMemberModal";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock("@/lib/queries", () => ({
  useCreateInvite: () => ({ mutateAsync, isPending: false }),
}));

function makeInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv_1",
    groupId: "grp_1",
    code: "ABCD1234",
    url: "",
    expiresAt: null,
    maxUses: null,
    uses: 0,
    createdAt: new Date("2026-08-01T00:00:00Z").toISOString(),
    ...overrides,
  };
}

const writeText = vi.fn().mockResolvedValue(undefined);

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
    writable: true,
  });
}

function renderModal(props: Partial<Parameters<typeof InviteMemberModal>[0]> = {}) {
  return render(
    <InviteMemberModal
      open
      onClose={vi.fn()}
      groupId="grp_1"
      {...props}
    />
  );
}

async function generateInvite(invite: ReturnType<typeof makeInvite>) {
  mutateAsync.mockResolvedValue({ invite });
  renderModal();
  fireEvent.click(screen.getByRole("button", { name: /generate invite/i }));
  await screen.findByLabelText(/share link/i);
}

describe("InviteMemberModal", () => {
  beforeEach(() => {
    setClipboard({ writeText });
    writeText.mockClear();
    mutateAsync.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("explains the invite and offers the generation form before an invite exists", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/max uses/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/expires in/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate invite/i })
    ).toBeInTheDocument();
  });

  it("builds a deep link carrying the group id and the access token", async () => {
    await generateInvite(makeInvite({ url: "" }));
    const link = screen.getByLabelText(/share link/i) as HTMLInputElement;
    expect(link.value).toBe(
      "http://localhost:3000/join/ABCD1234?group=grp_1"
    );
  });

  it("prefers the API link when it is a safe http(s) URL", async () => {
    await generateInvite(
      makeInvite({ url: "https://mergepay.app/i/ABCD1234" })
    );
    const link = screen.getByLabelText(/share link/i) as HTMLInputElement;
    expect(link.value).toBe("https://mergepay.app/i/ABCD1234");
  });

  it("ignores an unsafe API link and falls back to the locally built deep link", async () => {
    await generateInvite(makeInvite({ url: "javascript:alert(1)" }));
    const link = screen.getByLabelText(/share link/i) as HTMLInputElement;
    expect(link.value).toBe(
      "http://localhost:3000/join/ABCD1234?group=grp_1"
    );
  });

  it("copies the invite link and confirms with a sonner toast", async () => {
    await generateInvite(makeInvite());
    fireEvent.click(screen.getByRole("button", { name: /copy invite link/i }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "http://localhost:3000/join/ABCD1234?group=grp_1"
      )
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/invite link copied/i)
      )
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("copies the invite code and confirms with a sonner toast", async () => {
    await generateInvite(makeInvite());
    fireEvent.click(screen.getByRole("button", { name: /copy invite code/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("ABCD1234"));
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/invite code copied/i)
    );
  });

  it("reports clipboard failure instead of claiming success", async () => {
    writeText.mockRejectedValueOnce(new Error("NotAllowedError"));
    // Also disable the legacy fallback so the whole copy path fails.
    // @ts-expect-error — simulate a runtime without execCommand.
    document.execCommand = undefined;

    await generateInvite(makeInvite());
    fireEvent.click(screen.getByRole("button", { name: /copy invite link/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/could not copy the invite link/i)
      )
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("offers focusable, labelled copy controls for keyboard users", async () => {
    await generateInvite(makeInvite());
    const linkButton = screen.getByRole("button", { name: /copy invite link/i });
    linkButton.focus();
    expect(linkButton).toHaveFocus();
    expect(linkButton).toHaveAttribute("type", "button");
    expect(linkButton).toHaveAttribute("aria-label");
  });

  it("surfaces generation failures as an error toast", async () => {
    mutateAsync.mockRejectedValue({ status: 503 });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /generate invite/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/could not reach the invite service/i)
      )
    );
    // No invite was created, so the form is still on screen.
    expect(screen.getByLabelText(/max uses/i)).toBeInTheDocument();
  });

  it("resets back to the generation form when reopened", async () => {
    const { rerender } = renderModal();
    mutateAsync.mockResolvedValue({ invite: makeInvite() });
    fireEvent.click(screen.getByRole("button", { name: /generate invite/i }));
    await screen.findByLabelText(/share link/i);

    rerender(
      <InviteMemberModal open={false} onClose={vi.fn()} groupId="grp_1" />
    );
    rerender(<InviteMemberModal open onClose={vi.fn()} groupId="grp_1" />);

    expect(screen.getByLabelText(/max uses/i)).toBeInTheDocument();
  });
});
