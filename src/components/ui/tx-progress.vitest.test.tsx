import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  TxPhaseLine,
  TxProgress,
  TxStatusPanel,
  type TxStepItem,
} from "./tx-progress";

const STEPS: TxStepItem[] = [
  { id: "preparing", label: "Prepare" },
  { id: "signing", label: "Sign" },
  { id: "submitting", label: "Submit" },
  { id: "confirm", label: "Confirm" },
];

/** The sr-only status word under a step, by its visible label. */
function spokenState(label: string): string {
  const item = screen.getByText(label).closest("li");
  return item?.querySelector(".sr-only")?.textContent ?? "";
}

describe("TxProgress", () => {
  it("renders one labelled step per entry under an accessible name", () => {
    render(<TxProgress steps={STEPS} completed={0} label="Settlement progress" />);
    const list = screen.getByRole("list", { name: "Settlement progress" });
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(STEPS.length);
    for (const step of STEPS) {
      expect(within(list).getByText(step.label)).toBeInTheDocument();
    }
  });

  it("defaults to a generic accessible name", () => {
    render(<TxProgress steps={STEPS} completed={1} />);
    expect(screen.getByRole("list", { name: "Transaction progress" })).toBeInTheDocument();
  });

  it("marks exactly one step as the current one", () => {
    render(<TxProgress steps={STEPS} completed={2} />);
    expect(currentStep()).toHaveTextContent("Submit");
  });

  it("reads each step's state to assistive tech", () => {
    render(<TxProgress steps={STEPS} completed={1} />);
    expect(spokenState("Prepare")).toBe("complete");
    expect(spokenState("Sign")).toBe("in progress");
    expect(spokenState("Submit")).toBe("not started");
    expect(spokenState("Confirm")).toBe("not started");
  });

  it("has no current step once everything is done", () => {
    render(<TxProgress steps={STEPS} completed={STEPS.length} />);
    expect(currentStep()).toBeUndefined();
    for (const step of STEPS) {
      expect(spokenState(step.label)).toBe("complete");
    }
  });

  it("colours and names the in-progress step as failed when errored", () => {
    render(<TxProgress steps={STEPS} completed={1} errored />);
    expect(spokenState("Sign")).toBe("failed");
    expect(
      currentStep()?.querySelector("[aria-hidden=true]")
    ).toHaveClass("bg-flamingo");
  });

  it("leaves future steps empty rather than filled", () => {
    render(<TxProgress steps={STEPS} completed={0} />);
    const bars = screen
      .getAllByRole("listitem")
      .map((li) => li.querySelector("[aria-hidden=true]"));
    expect(bars[0]).toHaveClass("bg-lime");
    expect(bars[1]).toHaveClass("bg-transparent");
  });

  it("passes the className through for layout", () => {
    render(<TxProgress steps={STEPS} completed={0} className="max-w-xs" />);
    expect(screen.getByRole("list")).toHaveClass("max-w-xs");
  });
});

describe("TxStatusPanel", () => {
  it("is a polite live region carrying the title, body and footer", () => {
    render(
      <TxStatusPanel
        tone="grape"
        icon={<span data-testid="icon" />}
        title="Check your wallet"
        body="Approve the payment in Freighter."
        footer={<button type="button">Cancel</button>}
      />
    );
    const panel = screen.getByRole("status");
    expect(panel).toHaveAttribute("aria-live", "polite");
    expect(panel).toHaveTextContent("Check your wallet");
    expect(panel).toHaveTextContent("Approve the payment in Freighter.");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    // The decorative icon must not add a second, duplicate announcement.
    expect(screen.getByTestId("icon").closest("[aria-hidden=true]")).not.toBeNull();
  });

  it("is only busy while work is in flight", () => {
    const { rerender } = render(
      <TxStatusPanel tone="butter" icon={null} title="Submitting" body="…" live />
    );
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    rerender(<TxStatusPanel tone="butter" icon={null} title="Submitting" body="…" />);
    expect(screen.getByRole("status")).not.toHaveAttribute("aria-busy");
  });
});

describe("TxPhaseLine", () => {
  it("shows only the current phase — never the one it has already left", () => {
    const { rerender } = render(<TxPhaseLine text="Waiting for your signature in Freighter…" state="busy" />);
    rerender(<TxPhaseLine text="Waiting for the network to confirm…" state="busy" />);
    expect(screen.getByText("Waiting for the network to confirm…")).toBeInTheDocument();
    // An exit animation would keep the previous label mounted while it faded,
    // and a live region that lags the real phase is worse than no animation.
    expect(
      screen.queryByText("Waiting for your signature in Freighter…")
    ).not.toBeInTheDocument();
  });

  it("is busy only while the work is running", () => {
    const { rerender } = render(<TxPhaseLine text="Working" state="busy" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    rerender(<TxPhaseLine text="Done" state="done" />);
    expect(screen.getByRole("status")).not.toHaveAttribute("aria-busy");
    rerender(<TxPhaseLine text="Broken" state="error" />);
    expect(screen.getByRole("status")).not.toHaveAttribute("aria-busy");
  });

  it("keeps recovery actions beside the label that explains them", () => {
    render(
      <TxPhaseLine text="Still confirming" state="error">
        <button type="button">Check again</button>
      </TxPhaseLine>
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Still confirming");
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
    expect(status).toContainElement(screen.getByRole("button", { name: "Check again" }));
  });
});

function currentStep(): HTMLElement | undefined {
  return screen
    .getAllByRole("listitem")
    .find((li) => li.getAttribute("aria-current") === "step");
}
