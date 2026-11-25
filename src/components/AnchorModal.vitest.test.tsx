import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Sep24ModalProps } from "@/components/anchor/Sep24Modal";
import { AnchorModal } from "./AnchorModal";

vi.mock("@/components/anchor/Sep24Modal", () => ({
  Sep24Modal: ({ open, kind, assetCode, onClose }: Sep24ModalProps) =>
    open ? (
      <div role="dialog" aria-label={`${kind} ${assetCode}`}>
        <button type="button" onClick={onClose}>Close flow</button>
      </div>
    ) : null,
}));

describe("AnchorModal compatibility entry point", () => {
  it("forwards deposit settings and close handling to the complete SEP-24 flow", () => {
    const onClose = vi.fn();
    render(
      <AnchorModal
        open
        assetCode="USDC"
        kind="deposit"
        onClose={onClose}
        preferredAnchorName="TestAnchor"
      />
    );

    expect(screen.getByRole("dialog", { name: "deposit USDC" })).toBeInTheDocument();
    screen.getByRole("button", { name: "Close flow" }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
