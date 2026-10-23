import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { activeGroupIdFromPath, GroupSwitcher } from "./GroupSwitcher";

let pathname = "/dashboard";
let groupsState: {
  data: { groups: { id: string; name: string }[] } | undefined;
  isLoading: boolean;
};

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/lib/queries", () => ({
  useGroups: () => groupsState,
}));

describe("activeGroupIdFromPath", () => {
  it("reads the id from a group route", () => {
    expect(activeGroupIdFromPath("/groups/g1")).toBe("g1");
    expect(activeGroupIdFromPath("/groups/g1/expenses/new")).toBe("g1");
  });

  it("returns null outside a group route", () => {
    expect(activeGroupIdFromPath("/dashboard")).toBeNull();
    expect(activeGroupIdFromPath("/groups")).toBeNull();
    expect(activeGroupIdFromPath(null)).toBeNull();
  });
});

describe("GroupSwitcher", () => {
  beforeEach(() => {
    pathname = "/dashboard";
    groupsState = {
      data: {
        groups: [
          { id: "g1", name: "Flat 4B" },
          { id: "g2", name: "Lisbon trip" },
        ],
      },
      isLoading: false,
    };
  });

  it("links to each group and closes the drawer on navigate", () => {
    const onNavigate = vi.fn();
    render(<GroupSwitcher onNavigate={onNavigate} />);

    const link = screen.getByRole("link", { name: /lisbon trip/i });
    expect(link).toHaveAttribute("href", "/groups/g2");
    // Keep jsdom from attempting a real navigation; the handler still runs.
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("marks the group whose page is open", () => {
    pathname = "/groups/g2";
    render(<GroupSwitcher />);

    expect(screen.getByRole("link", { name: /lisbon trip/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      screen.getByRole("link", { name: /flat 4b/i })
    ).not.toHaveAttribute("aria-current");
  });

  it("renders nothing while loading or without groups", () => {
    groupsState = { data: undefined, isLoading: true };
    const { container, rerender } = render(<GroupSwitcher />);
    expect(container).toBeEmptyDOMElement();

    groupsState = { data: { groups: [] }, isLoading: false };
    rerender(<GroupSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });
});
