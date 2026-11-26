import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NetworkMismatchBanner } from "./network-mismatch-banner";
import type { WalletStatus } from "@/lib/walletStatus";

function status(overrides: Partial<WalletStatus> = {}): WalletStatus {
  return {
    kind: "network_mismatch",
    label: "Wrong network",
    message:
      "Your wallet is on a different network (currently PUBLIC). Switch it to Stellar testnet before signing.",
    actionLabel: "How to switch",
    actionKind: "switch_network",
    tone: "flamingo",
    canSign: false,
    address: "GABC",
    networkName: "PUBLIC",
    ...overrides,
  };
}

describe("NetworkMismatchBanner", () => {
  it("renders an assertive alert with switch instructions when mismatched", () => {
    render(<NetworkMismatchBanner status={status()} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/wrong stellar network/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/settings → network/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/settlement stay disabled/i);
  });

  it("renders nothing once the wallet is on the expected network", () => {
    const { container } = render(
      <NetworkMismatchBanner
        status={status({ kind: "connected", canSign: true })}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("lets the user re-check the network without reloading", () => {
    const onRefresh = vi.fn();
    render(<NetworkMismatchBanner status={status()} onRefresh={onRefresh} />);

    fireEvent.click(
      screen.getByRole("button", { name: /re-check the freighter network/i })
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
