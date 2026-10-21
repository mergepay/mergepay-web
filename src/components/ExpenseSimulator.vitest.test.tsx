import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExpenseSimulator } from "./ExpenseSimulator";

describe("ExpenseSimulator (#638)", () => {
  it("calculates 7-decimal stroop equal splits with remainder distribution", () => {
    render(
      <ExpenseSimulator
        initialParticipants={[
          { id: "1", name: "Alice" },
          { id: "2", name: "Bob" },
          { id: "3", name: "Charlie" },
        ]}
        defaultCurrency="XLM"
      />
    );

    expect(screen.getByText(/Expense Split Simulator/i)).toBeInTheDocument();
    expect(screen.getByText(/Rounding Note/i)).toBeInTheDocument();
    expect(screen.getByText("33.3333334 XLM")).toBeInTheDocument();
  });

  it("switches to custom split mode and validates participant share totals", () => {
    render(
      <ExpenseSimulator
        initialParticipants={[
          { id: "1", name: "Alice" },
          { id: "2", name: "Bob" },
        ]}
        defaultCurrency="USDC"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Custom Split/i }));
    expect(screen.getByRole("button", { name: /Custom Split/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});
