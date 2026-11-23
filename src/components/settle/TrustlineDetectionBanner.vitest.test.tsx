import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrustlineBalanceVerificationWarningBanner } from "./TrustlineDetectionBanner";

describe("TrustlineBalanceVerificationWarningBanner", () => {
  it("renders prominent neobrutalist warning banner with exact asset code and callback", () => {
    const onSetup = vi.fn();
    render(
      <TrustlineBalanceVerificationWarningBanner
        publicKey="GABC123"
        assetCode="USDC"
        assetIssuer="GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
        onSetupTrustline={onSetup}
      />
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Trustline Missing for USDC/i);
    expect(alert.className).toContain("border-ink");
    expect(alert.className).toContain("shadow-brutal-sm");

    const btn = screen.getByRole("button", { name: /Add USDC Trustline/i });
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);
    expect(onSetup).toHaveBeenCalledTimes(1);
  });
});
