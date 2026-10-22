import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TrustlineStatusBadge } from "./TrustlineStatusBadge";
import * as trustlineModule from "@/lib/trustline";

describe("TrustlineStatusBadge Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("displays loading state while checking trustline status", () => {
    vi.spyOn(trustlineModule, "checkUsdcTrustlineStatus").mockImplementation(
      () => new Promise(() => {}) // never resolves
    );

    render(<TrustlineStatusBadge publicKey="GABC123" />);
    expect(screen.getByText(/Checking USDC Trustline/i)).toBeInTheDocument();
  });

  it("displays active trustline state with balance when account has USDC trustline", async () => {
    vi.spyOn(trustlineModule, "checkUsdcTrustlineStatus").mockResolvedValue({
      kind: "confirmed_trusted",
      hasTrustline: true,
      balance: "100.5000000",
      assetCode: "USDC",
      assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    });

    render(<TrustlineStatusBadge publicKey="GABC123" />);

    await waitFor(() => {
      expect(screen.getByText(/USDC Trustline Active/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/100.50/)[0]).toBeInTheDocument();
  });

  it("displays missing trustline state with action button when account lacks USDC trustline", async () => {
    vi.spyOn(trustlineModule, "checkUsdcTrustlineStatus").mockResolvedValue({
      kind: "confirmed_missing",
      hasTrustline: false,
      balance: "0.0000000",
      assetCode: "USDC",
      assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    });

    const onAddTrustline = vi.fn();
    render(<TrustlineStatusBadge publicKey="GABC123" onAddTrustline={onAddTrustline} />);

    await waitFor(() => {
      expect(screen.getByText(/No USDC Trustline/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Add Trustline/i })).toBeInTheDocument();
  });

  it("displays unavailable status on Horizon or network errors without claiming missing trustline", async () => {
    vi.spyOn(trustlineModule, "checkUsdcTrustlineStatus").mockResolvedValue({
      kind: "error",
      hasTrustline: false,
      balance: "0.0000000",
      assetCode: "USDC",
      assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      error: "Horizon error 503",
    });

    render(<TrustlineStatusBadge publicKey="GABC123" />);

    await waitFor(() => {
      expect(screen.getByText(/USDC Status Unavailable/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/No USDC Trustline/i)).not.toBeInTheDocument();
  });

  it("displays unfunded status for accounts not yet on ledger", async () => {
    vi.spyOn(trustlineModule, "checkUsdcTrustlineStatus").mockResolvedValue({
      kind: "unfunded",
      hasTrustline: false,
      balance: "0.0000000",
      assetCode: "USDC",
      assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    });

    render(<TrustlineStatusBadge publicKey="GNEW123" />);

    await waitFor(() => {
      expect(screen.getByText(/Account Unfunded/i)).toBeInTheDocument();
    });
  });
});
