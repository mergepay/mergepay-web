import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoBadge } from "./MemoBadge";

/** The one node the badge always renders, regardless of severity. */
function badge() {
  return screen.getByTestId("memo-badge");
}

describe("MemoBadge (#373)", () => {
  it("marks a well-formed MP:<code> memo as verified and shows the code", () => {
    render(<MemoBadge memo="MP:dinner-8f3a" />);

    expect(badge()).toHaveAttribute("data-severity", "none");
    expect(badge()).toHaveTextContent("Verified");
    expect(badge()).toHaveTextContent("dinner-8f3a");
  });

  it("flags a missing memo without throwing", () => {
    render(<MemoBadge memo={null} />);

    expect(badge()).toHaveAttribute("data-severity", "missing");
    expect(badge()).toHaveTextContent("No memo");
  });

  it("treats a whitespace-only memo as missing", () => {
    render(<MemoBadge memo="   " />);

    expect(badge()).toHaveAttribute("data-severity", "missing");
  });

  it("flags a memo that lacks the MP: prefix as invalid", () => {
    render(<MemoBadge memo="custom-ref" />);

    expect(badge()).toHaveAttribute("data-severity", "malformed");
    expect(badge()).toHaveTextContent("Invalid");
    // The offending code is surfaced so the user can see what was recorded.
    expect(badge()).toHaveTextContent("custom-ref");
  });

  it("flags a memo longer than Stellar's 28-byte limit", () => {
    render(<MemoBadge memo={`MP:${"A".repeat(30)}`} />);

    expect(badge()).toHaveAttribute("data-severity", "invalid_length");
    expect(badge()).toHaveTextContent("Too long");
  });

  it("flags a deviation when the code differs from the expected expense code", () => {
    render(
      <MemoBadge memo="MP:lunch-1234" expectedShortCode="dinner-8f3a" />
    );

    expect(badge()).toHaveAttribute("data-severity", "deviation");
    expect(badge()).toHaveTextContent("Mismatch");
  });

  it("does not flag a deviation when the code matches", () => {
    render(
      <MemoBadge memo="MP:dinner-8f3a" expectedShortCode="dinner-8f3a" />
    );

    expect(badge()).toHaveAttribute("data-severity", "none");
  });

  it("hides the short code in compact mode but keeps the label", () => {
    render(<MemoBadge memo="MP:dinner-8f3a" compact />);

    expect(badge()).toHaveTextContent("Verified");
    expect(badge()).not.toHaveTextContent("dinner-8f3a");
  });

  it("exposes an accessible label describing the verification outcome", () => {
    render(<MemoBadge memo="MP:dinner-8f3a" />);

    expect(
      screen.getByLabelText(/Memo verification: Valid Settlement Memo/i)
    ).toBeInTheDocument();
  });
});
