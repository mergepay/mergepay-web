import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoPreview } from "./MemoPreview";

describe("MemoPreview", () => {
  it("returns null when memo is null", () => {
    const { container } = render(<MemoPreview memo={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when memo is undefined", () => {
    const { container } = render(<MemoPreview memo={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a valid MP: memo with prefix and code breakdown", () => {
    render(<MemoPreview memo="MP:dinner-8f3a" />);
    expect(screen.getByText("MP:")).toBeInTheDocument();
    expect(screen.getByText("dinner-8f3a")).toBeInTheDocument();
  });

  it("shows byte count information", () => {
    render(<MemoPreview memo="MP:dinner-8f3a" />);
    // The byte count text is split across JSX nodes, so check the progressbar
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "14");
    expect(bar).toHaveAttribute("aria-valuemax", "28");
  });

  it("renders a non-conforming memo without prefix annotation", () => {
    render(<MemoPreview memo="CUSTOM:dinner" />);
    // Should show the full memo as monospace text without prefix|code breakdown
    expect(screen.getAllByText("CUSTOM:dinner").length).toBeGreaterThan(0);
  });

  it("shows byte usage gauge", () => {
    render(<MemoPreview memo="MP:dinner-8f3a" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders editable input when editable is true", () => {
    const onEdit = vi.fn();
    render(
      <MemoPreview
        memo="MP:dinner-8f3a"
        editable
        editedMemo="MP:dinner-8f3a"
        onEdit={onEdit}
      />
    );
    const input = screen.getByRole("textbox", { name: /settlement memo/i });
    expect(input).toHaveValue("MP:dinner-8f3a");
  });

  it("calls onEdit when the user types in the input", () => {
    const onEdit = vi.fn();
    render(
      <MemoPreview
        memo="MP:dinner-8f3a"
        editable
        editedMemo="MP:dinner-8f3a"
        onEdit={onEdit}
      />
    );
    const input = screen.getByRole("textbox", { name: /settlement memo/i });
    fireEvent.change(input, { target: { value: "MP:modified-code" } });
    expect(onEdit).toHaveBeenCalledWith("MP:modified-code");
  });

  it("shows a warning when memo does not start with MP:", () => {
    render(<MemoPreview memo="BAD:dinner" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows a warning when memo deviates from expected code", () => {
    render(
      <MemoPreview memo="MP:wrong-code" expectedCode="dinner-8f3a" />
    );
    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((el) => el.textContent?.includes("expected"))).toBe(true);
  });

  it("shows remaining bytes in the gauge footer", () => {
    render(<MemoPreview memo="MP:dinner-8f3a" />);
    expect(screen.getByText(/bytes remaining/)).toBeInTheDocument();
  });
});
