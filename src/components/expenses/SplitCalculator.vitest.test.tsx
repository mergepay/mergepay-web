import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SplitCalculator, type SplitCalculatorChange } from "./SplitCalculator";

const participants = [
  { userId: "a", displayName: "Ada" },
  { userId: "b", displayName: "Ben" },
];

function renderCalculator(props: Partial<Parameters<typeof SplitCalculator>[0]> = {}) {
  const onChange = vi.fn<(change: SplitCalculatorChange) => void>();
  const utils = render(
    <SplitCalculator totalAmount="100" assetCode="XLM" participants={participants} onChange={onChange} {...props} />
  );
  return { ...utils, onChange, lastChange: () => onChange.mock.calls.at(-1)?.[0] };
}

describe("SplitCalculator", () => {
  it("splits equally by default and reports a valid split", async () => {
    const { lastChange } = renderCalculator();
    expect(screen.getByRole("radio", { name: "Equal" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("split-share-a")).toHaveTextContent("50 XLM");
    expect(screen.getByTestId("split-status")).toHaveTextContent("Shares add up to 100 XLM");
    await waitFor(() => expect(lastChange()?.valid).toBe(true));
    expect(lastChange()?.shares).toEqual([{ userId: "a" }, { userId: "b" }]);
  });

  it("warns in real time when exact amounts do not reach the total", async () => {
    const { lastChange } = renderCalculator();
    fireEvent.click(screen.getByRole("radio", { name: "Exact amounts" }));

    fireEvent.change(screen.getByLabelText("Ada"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Ben"), { target: { value: "30" } });

    const status = await screen.findByRole("alert");
    expect(status).toHaveTextContent("Amounts add up to 90 — 10 left to assign. They must total 100.");
    expect(lastChange()?.valid).toBe(false);

    fireEvent.change(screen.getByLabelText("Ben"), { target: { value: "40" } });
    await waitFor(() => expect(screen.getByTestId("split-status")).toHaveTextContent("Shares add up to 100 XLM"));
    expect(lastChange()).toMatchObject({
      mode: "custom",
      valid: true,
      shares: [
        { userId: "a", amount: "60" },
        { userId: "b", amount: "40" },
      ],
    });
  });

  it("warns when percentages exceed 100%", async () => {
    renderCalculator();
    fireEvent.click(screen.getByRole("radio", { name: "Percentage" }));
    fireEvent.change(screen.getByLabelText("Ada"), { target: { value: "70" } });
    fireEvent.change(screen.getByLabelText("Ben"), { target: { value: "40" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Percentages add up to 110% — 10% too much");
  });

  it("shows a row error for malformed input", async () => {
    renderCalculator();
    fireEvent.click(screen.getByRole("radio", { name: "Exact amounts" }));
    const ada = screen.getByLabelText("Ada");
    fireEvent.change(ada, { target: { value: "1,000" } });
    fireEvent.blur(ada);

    expect(await screen.findByText("Amount must be a plain number")).toBeInTheDocument();
    expect(ada).toHaveAttribute("aria-invalid", "true");
  });

  it("fills an even split that balances exactly", async () => {
    const { lastChange } = renderCalculator({ totalAmount: "10", participants: [...participants, { userId: "c", displayName: "Cy" }] });
    fireEvent.click(screen.getByRole("radio", { name: "Percentage" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /split evenly/i }));
    });

    expect(screen.getByLabelText("Ada")).toHaveValue("33.34");
    expect(screen.getByLabelText("Cy")).toHaveValue("33.33");
    await waitFor(() => expect(lastChange()?.valid).toBe(true));
    expect(screen.getByTestId("split-status")).toHaveTextContent("Percentages add up to 100%.");
  });

  it("asks for the expense amount before computing shares", () => {
    renderCalculator({ totalAmount: "" });
    expect(screen.getByTestId("split-status")).toHaveTextContent("Enter the expense amount to see each share.");
  });
});
