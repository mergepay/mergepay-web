import * as React from "react";
import { useState } from "react";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ModalLoadingFallback, PanelLoadingFallback, useMountOnFirstOpen } from "./lazy-overlay";

/** Lazy-loading primitives for code-split dialogs and panels (#887). */

describe("useMountOnFirstOpen", () => {
  it("stays false until the overlay is first opened", () => {
    const { result, rerender } = renderHook(({ open }) => useMountOnFirstOpen(open), {
      initialProps: { open: false },
    });
    expect(result.current).toBe(false);

    rerender({ open: true });
    expect(result.current).toBe(true);
  });

  it("stays true after closing, so close behaviour and exit animations are unchanged", () => {
    const { result, rerender } = renderHook(({ open }) => useMountOnFirstOpen(open), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    expect(result.current).toBe(true);
  });

  it("mounts the lazy child in the same commit that opens it", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const mounted = useMountOnFirstOpen(open);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          {mounted && <div data-testid="lazy-child">{open ? "open" : "closed"}</div>}
        </>
      );
    }
    render(<Harness />);
    expect(screen.queryByTestId("lazy-child")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByTestId("lazy-child")).toHaveTextContent("open");
  });
});

describe("ModalLoadingFallback", () => {
  it("is a fixed overlay, so loading never shifts the page layout", () => {
    render(<ModalLoadingFallback />);
    const overlay = screen.getByTestId("modal-loading-fallback");
    expect(overlay.className).toMatch(/\bfixed\b/);
    expect(overlay.className).toMatch(/\binset-0\b/);
  });

  it("announces loading to assistive technology", () => {
    render(<ModalLoadingFallback label="Loading expense form…" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading expense form…");
  });

  it("uses the neobrutalist dialog shell (border-3, hard shadow, paper)", () => {
    render(<ModalLoadingFallback />);
    const panel = screen.getByRole("status");
    expect(panel.className).toMatch(/border-3/);
    expect(panel.className).toMatch(/shadow-brutal/);
    expect(panel.className).toMatch(/bg-paper/);
  });
});

describe("PanelLoadingFallback", () => {
  it("reserves the panel height while the chunk loads", () => {
    render(<PanelLoadingFallback minHeightClass="min-h-[18rem]" label="Loading treasury…" />);
    const panel = screen.getByTestId("panel-loading-fallback");
    expect(panel.className).toContain("min-h-[18rem]");
    expect(screen.getByRole("status")).toHaveTextContent("Loading treasury…");
  });
});
