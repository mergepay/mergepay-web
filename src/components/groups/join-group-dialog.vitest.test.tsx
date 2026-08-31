import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    onClose,
    title,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

const mutateAsync = vi.fn();
const reset = vi.fn();
const push = vi.fn();
const replace = vi.fn();

let mockInviteData: unknown = undefined;
let mockInviteError = false;
let mockInviteLoading = false;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

vi.mock("@/lib/queries", () => ({
  useJoinGroup: () => ({ mutateAsync, isPending: false, reset }),
  useInviteByCode: () => ({
    data: mockInviteData,
    isError: mockInviteError,
    isLoading: mockInviteLoading,
    refetch: vi.fn(),
  }),
}));

import { JoinGroupDialog } from "./join-group-dialog";

const mockInvite = {
  id: "inv-1",
  groupId: "g1",
  code: "7QF3KD2P",
  url: "https://mergepay.app/join/7QF3KD2P",
  expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  maxUses: 5,
  uses: 2,
  createdAt: new Date().toISOString(),
};

describe("JoinGroupDialog", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockInviteData = undefined;
    mockInviteError = false;
    mockInviteLoading = false;
  });

  it("renders code input and join button", () => {
    render(<JoinGroupDialog open onClose={vi.fn()} />);
    expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /join group/i })
    ).toBeInTheDocument();
  });

  it("rejects malformed codes locally without calling the API", async () => {
    render(<JoinGroupDialog open onClose={vi.fn()} />);
    const input = screen.getByLabelText(/invite code/i);
    fireEvent.change(input, { target: { value: "AB" } });
    fireEvent.click(screen.getByRole("button", { name: /join group/i }));

    await waitFor(() => {
      expect(screen.getByText(/too short/i)).toBeInTheDocument();
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("calls mutateAsync and navigates on successful join", async () => {
    vi.mocked(mutateAsync).mockResolvedValue({
      group: { id: "g1", name: "Test Group" },
    });

    render(<JoinGroupDialog open onClose={vi.fn()} />);
    const input = screen.getByLabelText(/invite code/i);
    fireEvent.change(input, { target: { value: "7QF3KD2P" } });
    fireEvent.click(screen.getByRole("button", { name: /join group/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith("7QF3KD2P");
      expect(push).toHaveBeenCalledWith("/groups/g1");
    });
  });

  it("shows error message on join failure", async () => {
    vi.mocked(mutateAsync).mockRejectedValue({
      status: 410,
      code: "INVITE_EXPIRED",
    });

    render(<JoinGroupDialog open onClose={vi.fn()} />);
    const input = screen.getByLabelText(/invite code/i);
    fireEvent.change(input, { target: { value: "7QF3KD2P" } });
    fireEvent.click(screen.getByRole("button", { name: /join group/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("disables join button when code is empty", () => {
    render(<JoinGroupDialog open onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /join group/i })).toBeDisabled();
  });

  it("calls onClose when cancel is clicked", () => {
    const onClose = vi.fn();
    render(<JoinGroupDialog open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows invite details when a valid code is entered", () => {
    mockInviteData = { invite: mockInvite };
    render(
      <JoinGroupDialog open onClose={vi.fn()} initialCode="7QF3KD2P" />
    );
    expect(screen.getByText(/invite details/i)).toBeInTheDocument();
    expect(screen.getByText(/uses remaining/i)).toBeInTheDocument();
  });
});
