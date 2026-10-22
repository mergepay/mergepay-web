import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileDrawer } from "./MobileDrawer";

describe("MobileDrawer group and expense navigation variants (#611)", () => {
  it("renders bottom and right slide-over drawer variants with accessible label", () => {
    const { rerender } = render(
      <MobileDrawer open={true} onClose={vi.fn()} title="Group Actions" side="bottom">
        <div>Settle Up</div>
      </MobileDrawer>
    );
    expect(screen.getByRole("dialog", { name: "Group Actions" })).toBeInTheDocument();

    rerender(
      <MobileDrawer open={true} onClose={vi.fn()} title="Expense Filters" side="right">
        <div>Filter by USDC</div>
      </MobileDrawer>
    );
    expect(screen.getByRole("dialog", { name: "Expense Filters" })).toBeInTheDocument();
  });
});
