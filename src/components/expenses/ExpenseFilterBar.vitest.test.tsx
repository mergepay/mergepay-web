import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpenseFilterBar, type ActivityFilters } from "./ExpenseFilterBar";

/** Controlled harness: the bar is stateless, so tests own the value. */
function Harness({
  initial = {},
  onChange = vi.fn(),
  showStatus = true,
  showParticipant = true,
  extraActiveCount = 0,
  onClearExtras,
}: {
  initial?: ActivityFilters;
  onChange?: (next: ActivityFilters) => void;
  showStatus?: boolean;
  showParticipant?: boolean;
  extraActiveCount?: number;
  onClearExtras?: () => void;
}) {
  const [value, setValue] = useState<ActivityFilters>(initial);
  return (
    <ExpenseFilterBar
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      showStatus={showStatus}
      showParticipant={showParticipant}
      extraActiveCount={extraActiveCount}
      onClearExtras={onClearExtras}
    />
  );
}

describe("ExpenseFilterBar (#338)", () => {
  it("exposes a labelled search region with explicit labels for every control", () => {
    render(<Harness />);

    expect(
      screen.getByRole("search", { name: /search and filter activity feed/i })
    ).toBeVisible();
    expect(
      screen.getByRole("searchbox", { name: /search activity/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /filter by currency/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/filter from date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter to date/i)).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /filter by participant/i })
    ).toBeInTheDocument();
  });

  it("reports keyword text as the user types", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "sushi" },
    });

    expect(onChange).toHaveBeenLastCalledWith({ keyword: "sushi" });
    expect(screen.getByRole("searchbox")).toHaveValue("sushi");
  });

  it("filters by currency and by date range", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.change(screen.getByRole("combobox", { name: /filter by currency/i }), {
      target: { value: "USDC" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ assetCode: "USDC" });

    fireEvent.change(screen.getByLabelText(/filter from date/i), {
      target: { value: "2026-05-01" },
    });
    const last = onChange.mock.calls.at(-1)?.[0] as ActivityFilters;
    expect(last).toMatchObject({ assetCode: "USDC", fromDate: "2026-05-01" });

    fireEvent.change(screen.getByLabelText(/filter to date/i), {
      target: { value: "2026-05-31" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      assetCode: "USDC",
      fromDate: "2026-05-01",
      toDate: "2026-05-31",
    });
  });

  it("counts active filters and clears every one of them", () => {
    const onChange = vi.fn();
    const onClearExtras = vi.fn();
    render(
      <Harness
        initial={{ keyword: "taxi", assetCode: "XLM", status: "pending" }}
        onChange={onChange}
        extraActiveCount={1}
        onClearExtras={onClearExtras}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /clear \(4\)/i }));

    expect(onChange).toHaveBeenLastCalledWith({});
    expect(onClearExtras).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: /pending/i })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("omits the participant field and status toggle when disabled", () => {
    render(<Harness showParticipant={false} showStatus={false} />);

    expect(
      screen.queryByRole("textbox", { name: /filter by participant/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /settlement status/i })
    ).not.toBeInTheDocument();
  });
});
