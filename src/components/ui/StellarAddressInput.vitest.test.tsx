import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StellarAddressInput } from "./StellarAddressInput";
import type { StellarAddressValidation } from "@/lib/validators/stellarAddress";

const VALID = "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";
const SECRET = "SADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP54X";

function Harness({
  onValidationChange,
}: {
  onValidationChange?: (v: StellarAddressValidation) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <StellarAddressInput
      id="addr"
      label="Recipient"
      value={value}
      onChange={setValue}
      onValidationChange={onValidationChange}
    />
  );
}

const input = () => screen.getByLabelText("Recipient") as HTMLInputElement;

describe("StellarAddressInput", () => {
  it("configures mobile keyboards for an address", () => {
    render(<Harness />);
    const el = input();
    expect(el).toHaveAttribute("autocorrect", "off");
    expect(el).toHaveAttribute("autocapitalize", "characters");
    expect(el).toHaveAttribute("spellcheck", "false");
    expect(el).toHaveAttribute("autocomplete", "off");
    expect(el).toHaveAttribute("inputmode", "text");
  });

  it("shows neutral helper text while empty or incomplete", () => {
    render(<Harness />);
    expect(input()).not.toHaveAttribute("aria-invalid");
    fireEvent.change(input(), { target: { value: "GDVEU" } });
    expect(input()).toHaveAttribute("data-validation", "incomplete");
    expect(input()).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText(/keep typing/i)).toBeInTheDocument();
    expect(screen.getByText("(5/56)")).toBeInTheDocument();
  });

  it("marks a valid key with the valid state", () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: VALID } });
    expect(input()).toHaveAttribute("data-validation", "valid");
    expect(input()).not.toHaveAttribute("aria-invalid");
    expect(input().className).toMatch(/border-lime-dark/);
    expect(screen.getByText(/valid stellar public key/i)).toBeInTheDocument();
  });

  it("flags a mistyped key with an accessible error", () => {
    render(<Harness />);
    const typo = VALID.slice(0, 30) + (VALID[30] === "A" ? "B" : "A") + VALID.slice(31);
    fireEvent.change(input(), { target: { value: typo } });
    expect(input()).toHaveAttribute("aria-invalid", "true");
    expect(input().className).toMatch(/border-flamingo/);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/checksum/i);
    expect(input().getAttribute("aria-describedby")).toContain(alert.id);
  });

  it("normalises pasted lowercase and whitespace", () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: ` ${VALID.slice(0, 28).toLowerCase()}\n${VALID.slice(28)} ` } });
    expect(input().value).toBe(VALID);
    expect(input()).toHaveAttribute("data-validation", "valid");
  });

  it("warns when a secret key is pasted", () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: SECRET } });
    expect(screen.getByRole("alert")).toHaveTextContent(/secret key/i);
  });

  it("reports validation changes to the parent once per status", () => {
    const onValidationChange = vi.fn();
    render(<Harness onValidationChange={onValidationChange} />);
    fireEvent.change(input(), { target: { value: VALID } });
    const statuses = onValidationChange.mock.calls.map(([v]) => v.status);
    expect(statuses).toEqual(["empty", "valid"]);
  });
});
