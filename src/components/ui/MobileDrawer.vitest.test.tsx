import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MobileDrawer } from "./MobileDrawer";

describe("MobileDrawer responsive navigation (#619)", () => {
  it("renders accessible dialog drawer with title and closes via close button", () => {
    const onClose = vi.fn();
    render(
      <MobileDrawer open={true} onClose={onClose} title="Navigation" side="left">
        <nav>
          <a href="/groups">Groups</a>
        </nav>
      </MobileDrawer>
    );

    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const closeBtn = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render dialog content when open is false", () => {
    render(
      <MobileDrawer open={false} onClose={vi.fn()} title="Navigation">
        <p>Hidden drawer links</p>
      </MobileDrawer>
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
