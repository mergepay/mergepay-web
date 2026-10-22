import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import { dialogStack } from "@/lib/dialog";

// A mutable pathname so a test can "navigate" and re-render, the way the app
// re-renders when next/navigation reports a new route.
const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// The shell hosts network pollers, banners and wallet panels that have
// nothing to do with the drawer; stub them so this suite only exercises the
// navigation chrome.
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, logout: vi.fn() }),
}));
vi.mock("@/lib/queries", () => ({
  useWalletScopedCache: () => {},
}));
vi.mock("@/hooks/useWalletStatus", () => ({
  useWalletStatus: () => ({ refresh: vi.fn(), tone: "success", label: "Online" }),
}));
vi.mock("@/hooks/useOfflineSync", () => ({
  useOfflineSync: () => {},
}));
vi.mock("@/components/HorizonHealthIndicator", () => ({
  HorizonHealthIndicator: () => null,
}));
vi.mock("@/components/OfflineSyncBanner", () => ({
  OfflineSyncBanner: () => null,
}));
vi.mock("@/components/OfflineBanner", () => ({
  OfflineBanner: () => null,
}));
vi.mock("@/components/layout/wallet-disconnected-banner", () => ({
  WalletDisconnectedBanner: () => null,
}));
vi.mock("@/components/wallet/wallet-status", () => ({
  WalletStatusPanel: () => null,
}));
vi.mock("@/components/layout/BottomNav", () => ({
  BottomNav: () => null,
}));
vi.mock("@/components/CommandPalette", () => ({
  CommandPalette: () => null,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

beforeEach(() => {
  dialogStack.clear();
  nav.pathname = "/dashboard";
  document.body.style.overflow = "auto";
});

afterEach(() => {
  dialogStack.clear();
  document.body.style.overflow = "";
});

function renderShell() {
  return render(
    <AppShell>
      <p>Page content</p>
    </AppShell>
  );
}

async function openDrawer() {
  const trigger = screen.getByRole("button", { name: "Open menu" });
  // A real click focuses the button first and `fireEvent.click` does not, so
  // focus it here — otherwise there is no trigger for the drawer to hand
  // focus back to.
  trigger.focus();
  fireEvent.click(trigger);
  await screen.findByRole("dialog", { name: "Navigation menu" });
  return trigger;
}

describe("AppShell mobile drawer (#619)", () => {
  it("opens from the neobrutalist hamburger in the mobile header and locks the page", async () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: "Open menu" });
    // Neobrutalist chrome: the toggle carries the heavy border and hard shadow.
    expect(trigger.className).toContain("border-ink");
    expect(trigger.className).toContain("shadow-brutal-sm");

    await openDrawer();

    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    expect(dialogStack.size).toBe(1);
  });

  it("closes the drawer automatically when the route changes", async () => {
    const { rerender } = renderShell();
    const trigger = await openDrawer();

    // The route changes without any link inside the drawer being clicked —
    // e.g. the browser's back button or a programmatic redirect.
    nav.pathname = "/history";
    rerender(
      <AppShell>
        <p>Page content</p>
      </AppShell>
    );

    await waitFor(() => expect(document.body.style.overflow).toBe("auto"));
    expect(dialogStack.size).toBe(0);
    expect(trigger).toHaveFocus();
  });

  it("keeps the drawer open while the route has not changed", async () => {
    renderShell();
    await openDrawer();

    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    expect(dialogStack.size).toBe(1);
  });

  it("renders no drawer on desktop-sized markup until the toggle is used", () => {
    renderShell();
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).toBeNull();
  });
});
