import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccessibleDialog } from "./AccessibleDialog";

describe("AccessibleDialog (#635)", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
  });

  it("renders modal dialog semantics with aria-label and heading when title is provided", () => {
    render(
      <AccessibleDialog isOpen={true} onClose={vi.fn()} title="Settle Group Balance">
        <p>Confirm your Stellar transaction</p>
      </AccessibleDialog>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Settle Group Balance");
    expect(screen.getByText("Settle Group Balance")).toBeInTheDocument();
  });

  it("invokes onClose when cancel event fires on a dismissible dialog", () => {
    const onClose = vi.fn();
    render(
      <AccessibleDialog isOpen={true} onClose={onClose} title="Add Member">
        <button type="button">Confirm</button>
      </AccessibleDialog>
    );

    const dialog = screen.getByRole("dialog");
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("blocks cancel dismissal when dismissible is false", () => {
    const onClose = vi.fn();
    render(
      <AccessibleDialog
        isOpen={true}
        onClose={onClose}
        title="Signing in Freighter"
        dismissible={false}
      >
        <p>Waiting for signature</p>
      </AccessibleDialog>
    );

    const dialog = screen.getByRole("dialog");
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
