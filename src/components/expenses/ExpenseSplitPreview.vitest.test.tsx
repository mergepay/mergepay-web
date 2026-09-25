import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ComponentProps } from "react";
import { ExpenseSplitPreview } from "./ExpenseSplitPreview";
import type { SplitType } from "@/lib/types";

const PARTICIPANTS = [
  { userId: "u1", displayName: "Alice" },
  { userId: "u2", displayName: "Bob" },
  { userId: "u3", displayName: "Chidi" },
];

function renderPreview(
  props: Partial<ComponentProps<typeof ExpenseSplitPreview>> = {}
) {
  const splitType: SplitType = props.splitType ?? "equal";
  return render(
    <ExpenseSplitPreview
      amount="10.00"
      assetCode="XLM"
      splitType={splitType}
      participants={PARTICIPANTS}
      {...props}
    />
  );
}

function row(userId: string) {
  return screen.getByTestId(`split-row-${userId}`);
}

describe("ExpenseSplitPreview (#383)", () => {
  it("splits an amount equally and reports an exact total", () => {
    renderPreview();

    expect(row("u1")).toHaveTextContent("3.3333334");
    expect(row("u2")).toHaveTextContent("3.3333333");
    expect(row("u3")).toHaveTextContent("3.3333333");
    expect(screen.getByTestId("split-total-status")).toHaveTextContent(
      /total exactly to the expense amount/i
    );
  });

  it("flags the participant who received the rounded remainder stroop", () => {
    renderPreview();

    expect(row("u1")).toHaveAttribute("data-remainder", "true");
    expect(row("u2")).toHaveAttribute("data-remainder", "false");
    expect(row("u3")).toHaveAttribute("data-remainder", "false");
    expect(row("u1")).toHaveTextContent(/rounding/i);
  });

  it("renders percentage splits with exact totals", () => {
    renderPreview({
      splitType: "percentage",
      shares: [
        { userId: "u1", percent: 33.33 },
        { userId: "u2", percent: 33.33 },
        { userId: "u3", percent: 33.34 },
      ],
    });

    expect(screen.getByText("Percentage")).toBeInTheDocument();
    expect(row("u1")).toHaveTextContent("3.333");
    expect(row("u2")).toHaveTextContent("3.333");
    expect(row("u3")).toHaveTextContent("3.334");
    expect(screen.getByTestId("split-total-status")).toHaveTextContent(
      /total exactly/i
    );
  });

  it("renders exact (custom) amounts that add up to the total", () => {
    renderPreview({
      amount: "10.00",
      splitType: "custom",
      shares: [
        { userId: "u1", amount: "2.0000000" },
        { userId: "u2", amount: "3.0000000" },
        { userId: "u3", amount: "5.0000000" },
      ],
    });

    expect(screen.getByText("Exact amounts")).toBeInTheDocument();
    expect(row("u1")).toHaveTextContent("2.00");
    expect(row("u3")).toHaveTextContent("5.00");
    expect(screen.getByTestId("split-total-status")).toHaveTextContent(
      /total exactly/i
    );
  });

  it("warns when exact amounts are short of the expense total", () => {
    renderPreview({
      amount: "10.00",
      splitType: "custom",
      shares: [
        { userId: "u1", amount: "2.0000000" },
        { userId: "u2", amount: "3.0000000" },
        { userId: "u3", amount: "4.0000000" },
      ],
    });

    expect(screen.getByTestId("split-total-status")).toHaveTextContent(
      /short by 1.0000000 XLM/i
    );
  });

  it("warns when exact amounts exceed the expense total", () => {
    renderPreview({
      amount: "10.00",
      splitType: "custom",
      shares: [
        { userId: "u1", amount: "2.0000000" },
        { userId: "u2", amount: "3.0000000" },
        { userId: "u3", amount: "6.0000000" },
      ],
    });

    expect(screen.getByTestId("split-total-status")).toHaveTextContent(
      /over by 1.0000000 XLM/i
    );
  });

  it("shows the share as a percentage of the total", () => {
    renderPreview({
      splitType: "percentage",
      shares: [
        { userId: "u1", percent: 50 },
        { userId: "u2", percent: 25 },
        { userId: "u3", percent: 25 },
      ],
    });

    expect(row("u1")).toHaveTextContent("50% of total");
    expect(row("u2")).toHaveTextContent("25% of total");
  });

  it("prompts for an amount when none is entered", () => {
    renderPreview({ amount: "" });

    expect(
      screen.getByText(/enter an amount to preview/i)
    ).toBeInTheDocument();
  });

  it("reports a validation error when there are no participants", () => {
    renderPreview({ participants: [] });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /select at least one participant/i
    );
  });

  it("reports a validation error for an out-of-precision amount", () => {
    renderPreview({ amount: "1.12345678" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /up to 7 decimal places/i
    );
  });
});
