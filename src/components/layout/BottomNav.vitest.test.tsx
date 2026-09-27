import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomNav, BOTTOM_NAV_ITEMS, isBottomNavItemActive } from "./BottomNav";

const mockPathname = vi.hoisted(() => ({ current: "/dashboard" as string }));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.current,
}));

function renderAt(pathname: string) {
  mockPathname.current = pathname;
  return render(<BottomNav />);
}

describe("BottomNav (#542)", () => {
  it("renders the top-level destinations as icon links", () => {
    renderAt("/dashboard");
    const nav = screen.getByRole("navigation", { name: /mobile navigation/i });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(BOTTOM_NAV_ITEMS.length);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(
      BOTTOM_NAV_ITEMS.map((i) => i.href)
    );
    for (const item of BOTTOM_NAV_ITEMS) {
      expect(within(nav).getByRole("link", { name: item.label })).toBeInTheDocument();
    }
  });

  it("marks only the current route with aria-current=page", () => {
    renderAt("/groups");
    const nav = screen.getByRole("navigation", { name: /mobile navigation/i });
    const active = within(nav).getByRole("link", { name: "Groups" });
    expect(active).toHaveAttribute("aria-current", "page");
    for (const other of ["Dashboard", "Anchors", "Activity", "Settings"]) {
      expect(within(nav).getByRole("link", { name: other })).not.toHaveAttribute(
        "aria-current"
      );
    }
  });

  it("keeps a section highlighted on nested routes", () => {
    renderAt("/groups/grp-1");
    expect(
      screen.getByRole("link", { name: "Groups" })
    ).toHaveAttribute("aria-current", "page");
  });

  it("does not highlight dashboard on a nested path", () => {
    // `/dashboard` has no children, so a sibling route must not activate it.
    renderAt("/dashboard-extra");
    expect(
      screen.getByRole("link", { name: "Dashboard" })
    ).not.toHaveAttribute("aria-current");
  });

  it("stays clear of the device safe area and offers 48px touch targets", () => {
    renderAt("/dashboard");
    const nav = screen.getByRole("navigation", { name: /mobile navigation/i });
    // Mobile-only: the sidebar returns at `lg`.
    expect(nav.className).toContain("lg:hidden");
    expect(nav.className).toContain("fixed");
    expect(nav.className).toContain("bottom-0");
    expect(nav.className).toContain("pb-[env(safe-area-inset-bottom)]");

    for (const link of within(nav).getAllByRole("link")) {
      expect(link.className).toContain("min-h-12");
      expect(link.className).toContain("min-w-12");
    }
  });
});

describe("isBottomNavItemActive", () => {
  it("matches exact and nested routes", () => {
    expect(isBottomNavItemActive("/history", "/history")).toBe(true);
    expect(isBottomNavItemActive("/history/abc", "/history")).toBe(true);
    expect(isBottomNavItemActive("/history", "/groups")).toBe(false);
  });

  it("never treats the dashboard as an ancestor of another route", () => {
    expect(isBottomNavItemActive("/dashboard", "/dashboard")).toBe(true);
    expect(isBottomNavItemActive("/dashboard-extra", "/dashboard")).toBe(false);
  });

  it("is false when the pathname is not known yet", () => {
    expect(isBottomNavItemActive(null, "/groups")).toBe(false);
    expect(isBottomNavItemActive(undefined, "/groups")).toBe(false);
  });
});
