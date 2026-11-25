import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupDetail, GroupMember, Role } from "@/lib/types";

/**
 * Keyboard and screen-reader contract for member management: the per-member
 * menu button (WAI-ARIA menu pattern), role radio items, the removal
 * confirmation dialog, focus return and the polite live region.
 */

const mocks = vi.hoisted(() => ({
  updateRole: vi.fn(),
  removeMember: vi.fn(),
  archive: vi.fn(),
  leave: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/errorHandler", () => ({ handleApiError: vi.fn() }));

vi.mock("@/lib/queries", () => {
  const mutation = (fn: (...args: unknown[]) => Promise<unknown>) => ({
    mutateAsync: fn,
    isPending: false,
  });
  return {
    useUpdateMemberRole: () => mutation(mocks.updateRole),
    useRemoveMember: () => mutation(mocks.removeMember),
    useArchiveGroup: () => mutation(mocks.archive),
    useLeaveGroup: () => mutation(mocks.leave),
  };
});

// The invite modals pull in QR/clipboard code that isn't under test here.
vi.mock("./InviteMemberModal", () => ({ InviteMemberModal: () => null }));
vi.mock("./GroupInviteModal", () => ({ GroupInviteModal: () => null }));

import { MembersPanel } from "./members-panel";

function member(id: string, name: string, role: Role): GroupMember {
  return {
    id,
    groupId: "g1",
    userId: `u-${id}`,
    role,
    joinedAt: "2026-01-01T00:00:00.000Z",
    user: {
      id: `u-${id}`,
      displayName: name,
      stellarPublicKey: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
      avatarUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

const detail: GroupDetail = {
  group: {
    id: "g1",
    name: "Lisbon trip",
    description: null,
    createdByUserId: "u-me",
    treasuryEnabled: false,
    treasuryAccountPublicKey: null,
    treasuryRequiredSigners: null,
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  members: [member("me", "Me", "admin"), member("m2", "Ada", "member")],
  yourRole: "admin",
};

const renderPanel = () => render(<MembersPanel detail={detail} currentUserId="u-me" />);
const trigger = () => screen.getByRole("button", { name: /Manage Ada/ });

async function flushFrames() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateRole.mockResolvedValue(undefined);
  mocks.removeMember.mockResolvedValue(undefined);
  document.body.style.overflow = "";
});

describe("MembersPanel member menu", () => {
  it("wires aria-haspopup / aria-expanded / aria-controls on the trigger", () => {
    renderPanel();
    expect(trigger()).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(trigger()).not.toHaveAttribute("aria-controls");

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    const menu = screen.getByRole("menu", { name: "Manage Ada" });
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(trigger()).toHaveAttribute("aria-controls", menu.id);
  });

  it("exposes roles as menuitemradio with aria-checked", () => {
    renderPanel();
    fireEvent.click(trigger());
    const radios = screen.getAllByRole("menuitemradio");
    expect(radios.map((r) => r.textContent)).toEqual(["Admin", "Member", "Viewer"]);
    expect(screen.getByRole("menuitemradio", { name: "Member" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Admin" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("group", { name: "Role" })).toBeInTheDocument();
  });

  it("arrow keys traverse role items and the remove action", () => {
    renderPanel();
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(screen.getByRole("menuitemradio", { name: "Admin" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: "Remove from group" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(screen.getByRole("menuitemradio", { name: "Admin" })).toHaveFocus();
  });

  it("Escape closes the menu and returns focus to the trigger", () => {
    renderPanel();
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("locks background scrolling while the menu is open", () => {
    renderPanel();
    fireEvent.click(trigger());
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("changing role calls the mutation and announces the result", async () => {
    renderPanel();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Viewer" }));
    expect(mocks.updateRole).toHaveBeenCalledWith({ memberId: "m2", role: "viewer" });
    expect(trigger()).toHaveFocus();
    await waitFor(() => expect(screen.getByTestId("members-announcer")).toHaveTextContent("Ada is now Viewer"));
  });

  it("re-choosing the current role does not send a request", () => {
    renderPanel();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Member" }));
    expect(mocks.updateRole).not.toHaveBeenCalled();
  });
});

describe("MembersPanel removal confirmation", () => {
  it("opens an accessible dialog instead of window.confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    renderPanel();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from group" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("Remove Ada from Lisbon trip?");
    expect(confirmSpy).not.toHaveBeenCalled();
    // Safe default: Cancel gets initial focus.
    await flushFrames();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("Escape dismisses the dialog and focus returns to the member's menu button", async () => {
    renderPanel();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from group" }));
    await flushFrames();

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(mocks.removeMember).not.toHaveBeenCalled();
  });

  it("Tab stays trapped inside the dialog", async () => {
    renderPanel();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from group" }));
    await flushFrames();

    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 4; i++) {
      fireEvent.keyDown(document.activeElement!, { key: "Tab" });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("confirming removes the member, announces it and moves focus to the list heading", async () => {
    renderPanel();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from group" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(mocks.removeMember).toHaveBeenCalledWith("m2");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByTestId("members-announcer")).toHaveTextContent("Ada removed from the group")
    );
    await flushFrames();
    expect(screen.getByRole("heading", { name: "2 members" })).toHaveFocus();
  });

  it("leave and archive also confirm through the dialog", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Leave group/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Leave Lisbon trip?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.leave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Archive group/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Members keep read access");
  });
});
