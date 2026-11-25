import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletConnection } from "./WalletConnection";
import * as stellar from "@/lib/stellar";
import { useAuth as useAuthStore } from "@/lib/auth-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    isFreighterAvailable: vi.fn(),
  };
});

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("WalletConnection Component (#716)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().clear();
    useAuthStore.getState().clearWalletError();
    sessionStorage.clear();
  });

  it("renders connect button initially", () => {
    renderWithClient(<WalletConnection />);
    expect(screen.getByTestId("wallet-connection-trigger")).toBeInTheDocument();
    expect(screen.getByText(/Connect Freighter/i)).toBeInTheDocument();
  });

  it("detects missing extension before connecting and displays distinct warning dialog", async () => {
    vi.mocked(stellar.isFreighterAvailable).mockResolvedValue(false);

    renderWithClient(<WalletConnection />);
    const button = screen.getByTestId("wallet-connection-trigger");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("wallet-warning-dialog")).toBeInTheDocument();
    });

    expect(stellar.isFreighterAvailable).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("wallet-warning-title")).toHaveTextContent(/Freighter Not Detected/i);
    expect(screen.getByTestId("install-freighter-button")).toBeInTheDocument();
    expect(screen.getByTestId("retry-connection-button")).toBeInTheDocument();
    expect(useAuthStore.getState().walletError?.code).toBe("not_installed");
  });

  it("invokes onConnect when Freighter is available", async () => {
    vi.mocked(stellar.isFreighterAvailable).mockResolvedValue(true);
    const handleConnect = vi.fn().mockResolvedValue(undefined);

    renderWithClient(<WalletConnection onConnect={handleConnect} />);
    const button = screen.getByTestId("wallet-connection-trigger");
    fireEvent.click(button);

    await waitFor(() => {
      expect(handleConnect).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByTestId("wallet-warning-dialog")).not.toBeInTheDocument();
  });

  it("opens warning dialog when onConnect throws WalletLockedError and provides retry", async () => {
    vi.mocked(stellar.isFreighterAvailable).mockResolvedValue(true);
    const handleConnect = vi.fn().mockRejectedValueOnce(new stellar.WalletLockedError()).mockResolvedValueOnce(undefined);

    renderWithClient(<WalletConnection onConnect={handleConnect} />);
    const button = screen.getByTestId("wallet-connection-trigger");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("wallet-warning-dialog")).toBeInTheDocument();
    });

    expect(screen.getByTestId("wallet-warning-title")).toHaveTextContent(/Freighter Wallet Locked/i);

    const retryBtn = screen.getByTestId("retry-connection-button");
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(handleConnect).toHaveBeenCalledTimes(2);
    });
  });
});
