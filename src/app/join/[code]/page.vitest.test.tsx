import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import JoinByCodePage from "./page";

const mutateAsync = vi.fn();
const reset = vi.fn();
const replace = vi.fn();
const push = vi.fn();

let mockParams: { code: string | string[] } = { code: "7QF3KD2P" };
let mockToken: string | null = "test-token";
let mockHydrated = true;
let mockInviteData: unknown = undefined;
let mockInviteError: unknown = null;
let mockInviteLoading = false;

vi.mock("next/navigation", () => ({
  useParams: () => mockParams,
  useRouter: () => ({ push, replace }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ token: mockToken, hydrated: mockHydrated }),
}));

vi.mock("@/lib/queries", () => ({
  useJoinGroup: () => ({ mutateAsync, isPending: false, reset }),
  useInviteByCode: () => ({
    data: mockInviteData,
    isError: mockInviteError !== null,
    isLoading: mockInviteLoading,
    error: mockInviteError,
  }),
}));

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

describe("JoinByCodePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockParams = { code: "7QF3KD2P" };
    mockToken = "test-token";
    mockHydrated = true;
    mockInviteData = { invite: mockInvite };
    mockInviteError = null;
    mockInviteLoading = false;
  });

  it("shows loading state while fetching invite", () => {
    mockInviteLoading = true;
    mockInviteData = undefined;
    render(<JoinByCodePage />);
    expect(
      screen.getByRole("heading", { name: /loading invite/i })
    ).toBeInTheDocument();
  });

  it("shows group identity and join button after invite loads", () => {
    render(<JoinByCodePage />);
    expect(
      screen.getByRole("button", { name: /join group/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/You've been invited/i)).toBeInTheDocument();
  });

  it("shows invite details including expiry and uses", () => {
    render(<JoinByCodePage />);
    expect(screen.getByText(/expires/i)).toBeInTheDocument();
    expect(screen.getByText(/uses remaining/i)).toBeInTheDocument();
  });

  it("shows error state for malformed code", () => {
    mockParams = { code: "AB" };
    mockInviteData = undefined;
    render(<JoinByCodePage />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows error state when invite fetch fails", () => {
    mockInviteData = undefined;
    mockInviteError = { status: 404 };
    render(<JoinByCodePage />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("calls mutateAsync on join button click", async () => {
    vi.mocked(mutateAsync).mockResolvedValue({
      group: { id: "g1", name: "Test Group" },
    });
    render(<JoinByCodePage />);
    fireEvent.click(screen.getByRole("button", { name: /join group/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith("7QF3KD2P");
    });
  });

  it("shows error on join failure", async () => {
    mockParams = { code: "JOINTST1" };
    vi.mocked(mutateAsync).mockRejectedValue({ status: 410, code: "INVITE_EXPIRED" });
    render(<JoinByCodePage />);
    fireEvent.click(screen.getByRole("button", { name: /join group/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("shows maybe later button to skip joining", () => {
    render(<JoinByCodePage />);
    expect(
      screen.getByRole("button", { name: /maybe later/i })
    ).toBeInTheDocument();
  });
});
