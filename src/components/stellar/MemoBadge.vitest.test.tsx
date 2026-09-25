import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoBadge } from "./MemoBadge";

/** The badge's root element, located by its severity data attribute. */
function badgeFor(status: string) {
  return document.querySelector(`[data-memo-status="${status}"]`);
}

describe("MemoBadge", () => {
  it("renders nothing when there is no memo", () => {
    const { container } = render(<MemoBadge memo={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a blank memo", () => {
    const { container } = render(<MemoBadge memo="   " />);
    expect(container).toBeEmptyDOMElement();
  });

  it("verifies a well-formed MP: memo and shows its reference", () => {
    render(<MemoBadge memo="MP:dinner-8f3a" />);
    expect(screen.getByText("Verified memo")).toBeInTheDocument();
    expect(screen.getByText("dinner-8f3a")).toBeInTheDocument();
    expect(badgeFor("none")).not.toBeNull();
  });

  it("accepts an uppercase alphanumeric code", () => {
    render(<MemoBadge memo="MP:AB12CD" />);
    expect(screen.getByText("AB12CD")).toBeInTheDocument();
    expect(badgeFor("none")).not.toBeNull();
  });

  it("trims surrounding whitespace before validating", () => {
    render(<MemoBadge memo="  MP:trip-2026  " />);
    expect(screen.getByText("trip-2026")).toBeInTheDocument();
    expect(badgeFor("none")).not.toBeNull();
  });

  it("flags a memo that is missing the MP: prefix", () => {
    render(<MemoBadge memo="dinner-8f3a" />);
    expect(screen.getByText("Check memo")).toBeInTheDocument();
    expect(badgeFor("malformed")).not.toBeNull();
  });

  it("flags an empty expense code after the prefix", () => {
    render(<MemoBadge memo="MP:" />);
    expect(screen.getByText("Check memo")).toBeInTheDocument();
    expect(badgeFor("malformed")).not.toBeNull();
  });

  it("flags disallowed characters in the code", () => {
    render(<MemoBadge memo="MP:has space" />);
    expect(screen.getByText("Check memo")).toBeInTheDocument();
    expect(badgeFor("malformed")).not.toBeNull();
  });

  it("flags a memo over the Stellar byte limit", () => {
    render(<MemoBadge memo={`MP:${"a".repeat(28)}`} />);
    expect(screen.getByText("Check memo")).toBeInTheDocument();
    expect(badgeFor("invalid_length")).not.toBeNull();
  });

  it("softens the warning when the code deviates from the expected one", () => {
    render(<MemoBadge memo="MP:dinner-8f3a" expectedShortCode="trip-1234" />);
    expect(screen.getByText("Unverified memo")).toBeInTheDocument();
    expect(badgeFor("deviation")).not.toBeNull();
  });

  it("exposes a descriptive accessible label", () => {
    render(<MemoBadge memo="MP:dinner-8f3a" />);
    expect(
      screen.getByLabelText(/verified memo: memo conforms to mergepay/i)
    ).toBeInTheDocument();
  });

  it("explains a malformed memo via the accessible label", () => {
    render(<MemoBadge memo="dinner-8f3a" />);
    expect(
      screen.getByLabelText(/check memo: memo "dinner-8f3a" does not begin/i)
    ).toBeInTheDocument();
  });
});
