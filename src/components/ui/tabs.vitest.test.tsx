import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TabPanel, Tabs, type TabDef } from "./tabs";

const TABS: TabDef[] = [
  { id: "all", label: "All" },
  { id: "expenses", label: "Expenses" },
  { id: "settlements", label: "Settlements" },
];

function Harness({ initial = "all" }: { initial?: string }) {
  const [active, setActive] = useState(initial);
  return (
    <>
      <Tabs idBase="t" label="Filter" tabs={TABS} active={active} onChange={setActive} />
      <TabPanel idBase="t" tabId={active}>
        Showing {active}
      </TabPanel>
    </>
  );
}

const tab = (name: string) => screen.getByRole("tab", { name });

describe("Tabs", () => {
  it("wires tablist, tab and tabpanel ARIA", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "Filter" })).toBeInTheDocument();

    const panel = screen.getByRole("tabpanel");
    for (const t of screen.getAllByRole("tab")) {
      expect(t).toHaveAttribute("aria-controls", panel.id);
    }
    expect(tab("All")).toHaveAttribute("aria-selected", "true");
    expect(tab("Expenses")).toHaveAttribute("aria-selected", "false");
    expect(panel).toHaveAttribute("aria-labelledby", tab("All").id);
  });

  it("uses a roving tabIndex", () => {
    render(<Harness />);
    expect(tab("All")).toHaveAttribute("tabindex", "0");
    expect(tab("Expenses")).toHaveAttribute("tabindex", "-1");
    expect(tab("Settlements")).toHaveAttribute("tabindex", "-1");
  });

  it("ArrowRight / ArrowLeft move selection and focus, wrapping around", () => {
    render(<Harness />);
    tab("All").focus();

    fireEvent.keyDown(tab("All"), { key: "ArrowRight" });
    expect(tab("Expenses")).toHaveFocus();
    expect(tab("Expenses")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Showing expenses");

    fireEvent.keyDown(tab("Expenses"), { key: "ArrowLeft" });
    fireEvent.keyDown(tab("All"), { key: "ArrowLeft" });
    expect(tab("Settlements")).toHaveFocus();
    expect(tab("Settlements")).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tab("Settlements"), { key: "ArrowRight" });
    expect(tab("All")).toHaveFocus();
  });

  it("Home / End jump to the first / last tab", () => {
    render(<Harness initial="expenses" />);
    tab("Expenses").focus();

    fireEvent.keyDown(tab("Expenses"), { key: "End" });
    expect(tab("Settlements")).toHaveFocus();
    expect(tab("Settlements")).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tab("Settlements"), { key: "Home" });
    expect(tab("All")).toHaveFocus();
    expect(tab("All")).toHaveAttribute("aria-selected", "true");
  });

  it("selects a tab on click", () => {
    render(<Harness />);
    fireEvent.click(tab("Settlements"));
    expect(tab("Settlements")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", tab("Settlements").id);
  });

  it("keeps the first tab focusable when active matches no tab", () => {
    render(<Tabs tabs={TABS} active="missing" onChange={() => {}} />);
    expect(tab("All")).toHaveAttribute("tabindex", "0");
  });
});
