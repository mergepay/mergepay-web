import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import LoginPage from "./page";
import * as stellar from "@/lib/stellar";
import { useAuth as useAuthStore } from "@/lib/auth-store";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
  }),
}));

const mockLogin = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    token: null,
    restoring: false,
    login: mockLogin,
    isLoading: false,
    user: null,
    isAuthenticated: false,
    logout: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    isFreighterAvailable: vi.fn(),
    getWalletNetwork: vi.fn().mockResolvedValue(null),
  };
});

describe("LoginPage Freighter Error Handling & Retry (#716)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().clear();
    useAuthStore.getState().clearWalletError();
    sessionStorage.clear();
  });

  it("detects uninstalled Freighter before invoking connection hooks and renders warning dialog", async () => {
    vi.mocked(stellar.isFreighterAvailable).mockResolvedValue(false);

    render(<LoginPage />);

    const connectButton = screen.getByTestId("login-connect");
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByTestId("wallet-warning-dialog")).toBeInTheDocument();
    });

    // Verify connection hook was not invoked
    expect(mockLogin).not.toHaveBeenCalled();

    // Verify distinct neobrutalist warning dialog content
    expect(screen.getByTestId("wallet-warning-title")).toHaveTextContent(/Freighter Not Detected/i);
    expect(screen.getByTestId("wallet-warning-message")).toHaveTextContent(
      /Freighter browser extension was not detected/i
    );

    // Verify Install Freighter action link
    const installLink = screen.getByTestId("install-freighter-button");
    expect(installLink).toBeInTheDocument();
    expect(installLink).toHaveAttribute("href", "https://freighter.app");

    // Verify working Retry Connection button
    const retryBtn = screen.getByTestId("retry-connection-button");
    expect(retryBtn).toBeInTheDocument();
  });

  it("displays distinct warning dialog when Freighter is locked and retries connection", async () => {
    vi.mocked(stellar.isFreighterAvailable).mockResolvedValue(true);
    mockLogin.mockRejectedValueOnce(new stellar.WalletLockedError());

    render(<LoginPage />);

    const connectButton = screen.getByTestId("login-connect");
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByTestId("wallet-warning-dialog")).toBeInTheDocument();
    });

    expect(screen.getByTestId("wallet-warning-title")).toHaveTextContent(/Freighter Wallet Locked/i);
    expect(screen.getByTestId("wallet-warning-message")).toHaveTextContent(
      /Your Freighter wallet is currently locked/i
    );

    // Simulate unlocking and clicking Retry Connection
    mockLogin.mockResolvedValueOnce({ id: "u1", stellarPublicKey: "GABC123" });
    const retryBtn = screen.getByTestId("retry-connection-button");
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("closes the warning dialog when dismiss button is clicked", async () => {
    vi.mocked(stellar.isFreighterAvailable).mockResolvedValue(false);

    render(<LoginPage />);

    const connectButton = screen.getByTestId("login-connect");
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(screen.getByTestId("wallet-warning-dialog")).toBeInTheDocument();
    });

    const dismissBtn = screen.getByTestId("wallet-warning-dismiss");
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(screen.queryByTestId("wallet-warning-dialog")).not.toBeInTheDocument();
    });
    expect(useAuthStore.getState().walletError).toBeNull();
  });
});
