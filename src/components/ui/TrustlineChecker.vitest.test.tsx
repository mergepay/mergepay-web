import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TrustlineChecker } from "./TrustlineChecker";
import * as trustlineLib from "@/lib/trustline";

describe("TrustlineChecker Stellar XLM/USDC indicator (#621)", () => {
  const usdcAsset: trustlineLib.ConfiguredAsset = {
    code: "USDC",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  };

  it("renders nothing for native XLM since no trustline is required", () => {
    const { container } = render(
      <TrustlineChecker
        publicKey="GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
        requiredAssets={[{ code: "XLM", issuer: null }]}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders missing trustline warning when connected account lacks USDC trustline", async () => {
    vi.spyOn(trustlineLib, "fetchHorizonAccountBalances").mockResolvedValueOnce([
      { asset_type: "native", balance: "100.0000000" },
    ]);
    const onAddTrustline = vi.fn();

    render(
      <TrustlineChecker
        publicKey="GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
        requiredAssets={[usdcAsset]}
        onAddTrustline={onAddTrustline}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert").textContent).toContain("USDC");

    const addButton = screen.getByRole("button", { name: /add trustline/i });
    fireEvent.click(addButton);
    expect(onAddTrustline).toHaveBeenCalledTimes(1);
  });
});
