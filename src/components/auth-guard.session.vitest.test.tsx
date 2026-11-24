import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthGuard } from "./auth-guard";
import { useAuth as useAuthStore } from "@/lib/auth-store";

const { authState, replace } = vi.hoisted(() => ({
  authState: {
    token: null as string | null,
    restoring: false,
    logout: vi.fn(),
    login: vi.fn(),
    isLoading: false,
  },
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/hooks/useTokenExpiry", () => ({
  useTokenExpiry: () => ({ state: "none", exp: null }),
}));

describe("AuthGuard session expiry", () => {
  afterEach(() => {
    replace.mockClear();
    authState.token = null;
    authState.restoring = false;
    useAuthStore.getState().forgetWallet();
    useAuthStore.getState().setRestoreStatus("settled");
  });

  it("shows the Freighter re-auth dialog and does not redirect", async () => {
    useAuthStore.getState().setSessionExpired(true);

    render(
      <AuthGuard>
        <p>Private balance</p>
      </AuthGuard>
    );

    expect(
      screen.getByText(/to continue where you left off/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /re-connect wallet/i })).toBeInTheDocument();
    expect(screen.queryByText("Private balance")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(replace).not.toHaveBeenCalled();
    });
  });

  it("redirects to login when the session is simply absent", async () => {
    useAuthStore.getState().setSessionExpired(false);

    render(
      <AuthGuard>
        <p>Private balance</p>
      </AuthGuard>
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
