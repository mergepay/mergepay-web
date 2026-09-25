import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoWarningBanner } from "./MemoWarningBanner";

describe("MemoWarningBanner", () => {
  it("renders nothing when memo is completely valid and conforms to convention", () => {
    const { container } = render(
      <MemoWarningBanner memo="MP:dinner-8f3a" expectedShortCode="dinner-8f3a" />
    );

    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("renders an accessible alert when memo is missing", () => {
    render(<MemoWarningBanner memo="" expectedShortCode="dinner-8f3a" />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveAttribute("aria-atomic", "true");
    expect(alert).toHaveTextContent("Missing Settlement Memo");
    expect(alert).toHaveTextContent("Automated debt clearing requires an MP:<code> memo");
  });

  it("renders a warning when memo lacks the MP: prefix", () => {
    render(<MemoWarningBanner memo="custom-ref" />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Unrecognized Memo Format");
    expect(alert).toHaveTextContent('does not begin with the required "MP:" prefix');
  });

  it("renders an error when memo exceeds Stellar limit of 28 bytes", () => {
    const longMemo = "MP:" + "A".repeat(30);
    render(<MemoWarningBanner memo={longMemo} />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Memo Exceeds Stellar Limit");
    expect(alert).toHaveTextContent("exceeding the Stellar ledger limit of 28 bytes");
    expect(screen.getByText(/33\/28B/)).toBeInTheDocument();
  });

  it("renders deviation warning when memo code differs from expected expense code", () => {
    render(
      <MemoWarningBanner
        memo="MP:lunch-1234"
        expectedShortCode="dinner-8f3a"
      />
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Reconciliation Code Mismatch");
    expect(alert).toHaveTextContent('differs from the expected expense code "dinner-8f3a"');
  });

  it("provides a quick-action button to apply suggested memo", () => {
    const handleFix = vi.fn();
    render(
      <MemoWarningBanner
        memo="wrong-memo"
        expectedShortCode="dinner-8f3a"
        onFixMemo={handleFix}
      />
    );

    const fixButton = screen.getByRole("button", { name: /use suggested memo/i });
    expect(fixButton).toBeInTheDocument();
    expect(fixButton).toHaveTextContent("MP:dinner-8f3a");

    fireEvent.click(fixButton);
    expect(handleFix).toHaveBeenCalledWith("MP:dinner-8f3a");
  });
});
