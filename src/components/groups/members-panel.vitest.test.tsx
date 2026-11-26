import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { MembersPanel } from "./members-panel";
import type { GroupDetail } from "@/lib/types";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const updateRole = vi.hoisted(() => vi.fn());
const removeMember = vi.hoisted(() => vi.fn());

vi.mock("@/lib/queries", () => ({
  useCreateInvite: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLeaveGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMemberRole: () => ({ mutateAsync: updateRole, isPending: false }),
  useRemoveMember: () => ({ mutateAsync: removeMember, isPending: false }),
}));

function detail(): GroupDetail {
  return {
    group: {
      id: "grp_1",
      name: "Trip",
      description: null,
      createdByUserId: "user-a",
      treasuryEnabled: false,
      treasuryAccountPublicKey: null,
      treasuryRequiredSigners: null,
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    yourRole: "admin",
    members: [
      {
        id: "mem-a",
        groupId: "grp_1",
        userId: "user-a",
        role: "admin",
        joinedAt: "2026-01-01T00:00:00.000Z",
        user: {
          id: "user-a",
          stellarPublicKey: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
          displayName: "Ada",
          avatarUrl: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
      {
        id: "mem-b",
        groupId: "grp_1",
        userId: "user-b",
        role: "member",
        joinedAt: "2026-01-02T00:00:00.000Z",
        user: {
          id: "user-b",
          stellarPublicKey: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
          displayName: "Bob",
          avatarUrl: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
    ],
  };
}

function renderPanel() {
  return render(<MembersPanel detail={detail()} currentUserId="user-a" />);
}

describe("MembersPanel member actions", () => {
  beforeEach(() => {
    updateRole.mockReset();
    updateRole.mockResolvedValue(undefined);
    removeMember.mockReset();
    removeMember.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  it("exposes the role and removal actions through an ARIA menu button", async () => {
    renderPanel();

    const trigger = screen.getByRole("button", { name: "Manage Bob" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(trigger, { key: "Enter" });

    const menu = await screen.findByRole("menu", { name: "Manage Bob" });
    expect(menu).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const admin = screen.getByRole("menuitem", { name: /^admin/i });
    const member = screen.getByRole("menuitem", { name: /^member/i });
    const viewer = screen.getByRole("menuitem", { name: /^viewer/i });

    expect(admin).not.toHaveAttribute("aria-disabled");
    // The member's current role is announced but not actionable.
    expect(member).toHaveAttribute("aria-disabled", "true");
    expect(viewer).toBeInTheDocument();
    expect(admin).toHaveFocus();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    renderPanel();

    const trigger = screen.getByRole("button", { name: "Manage Bob" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    await screen.findByRole("menu", { name: "Manage Bob" });

    fireEvent.keyDown(screen.getByRole("menu", { name: "Manage Bob" }), {
      key: "Escape",
    });

    await waitFor(() =>
      expect(screen.queryByRole("menu", { name: "Manage Bob" })).not.toBeInTheDocument()
    );
    expect(trigger).toHaveFocus();
  });

  it("updates the selected role and confirms with a toast", async () => {
    renderPanel();

    const trigger = screen.getByRole("button", { name: "Manage Bob" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await screen.findByRole("menu", { name: "Manage Bob" });

    fireEvent.click(screen.getByRole("menuitem", { name: /^viewer/i }));

    await waitFor(() =>
      expect(updateRole).toHaveBeenCalledWith({
        memberId: "mem-b",
        role: "viewer",
      })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Role updated to viewer")
    );
  });

  it("keeps removal behind the same accessible menu", async () => {
    // jsdom's confirm is not implemented; make the destructive path explicit.
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Manage Bob" }));
    const remove = await screen.findByRole("menuitem", {
      name: /remove from group/i,
    });
    fireEvent.click(remove);

    await waitFor(() => expect(removeMember).toHaveBeenCalledWith("mem-b"));
  });
});
