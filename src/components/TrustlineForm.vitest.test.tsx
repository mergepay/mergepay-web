import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import { TrustlineForm } from "./TrustlineForm";

describe("TrustlineForm", () => {
  it("renders accessible inline errors and blocks invalid submissions", async () => {
    const onSubmit = vi.fn();
    render(<TrustlineForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Asset code"), { target: { value: "BAD-CODE" } });
    fireEvent.change(screen.getByLabelText("Issuer public key"), { target: { value: "G123" } });
    fireEvent.click(screen.getByRole("button", { name: /continue with asset/i }));
    expect(await screen.findAllByRole("alert")).toHaveLength(2);
    expect(screen.getByLabelText("Asset code")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Issuer public key")).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits validated asset details exactly once", async () => {
    const onSubmit = vi.fn();
    const assetIssuer = Keypair.random().publicKey();
    render(<TrustlineForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Asset code"), { target: { value: "USDC" } });
    fireEvent.change(screen.getByLabelText("Issuer public key"), { target: { value: assetIssuer } });
    fireEvent.click(screen.getByRole("button", { name: /continue with asset/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ assetCode: "USDC", assetIssuer }, expect.anything()));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("disables submission when disabled", () => {
    render(<TrustlineForm onSubmit={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: /continue with asset/i })).toBeDisabled();
  });
});
