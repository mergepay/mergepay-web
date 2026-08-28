import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, api } from "@/lib/api";
import { SettleDialog, type SettleTarget } from "./settle-dialog";

const mutateAsync = vi.fn();
const statusQuery = { data: undefined };

vi.mock("@/lib/queries", () => ({
  useConfirmSettlement: () => ({ mutateAsync }),
  useSettlementStatus: () => statusQuery,
}));

vi.mock("@/lib/stellar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stellar")>("@/lib/stellar");
  return { ...actual, signXdr: vi.fn().mockResolvedValue("signed-xdr") };
});

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      createSettlement: vi.fn(),
      settleExpense: vi.fn(),
    },
  };
});

// The wallet-gating added in #176 disables "Settle now" until the wallet is
// connected, on the right network, and ready to sign. These tests exercise the
// settlement state machine, not wallet readiness, so present a connected wallet.
vi.mock("@/hooks/useWalletStatus", () => ({
  useWalletStatus: () => ({
    kind: "connected",
    label: "Connected",
    message: "Connected to Testnet. Mergepay never sees your keys.",
    actionLabel: null,
    actionKind: null,
    tone: "lime",
    canSign: true,
    address: "GUSER1",
    networkName: "TESTNET",
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/wallet-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/wallet-store")>("@/lib/wallet-store");
  return { ...actual, useWalletDisconnected: () => false };
});

const target: SettleTarget = {
  to: {
    id: "user-2",
    stellarPublicKey: "GUSER2",
    displayName: "Taylor",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  amount: "10",
  assetCode: "XLM",
  assetIssuer: null,
  label: "Settle up with Taylor",
};

const intent = {
  settlement: { id: "settlement-1" },
  xdr: "unsigned-xdr",
  networkPassphrase: "Test SDF Network ; September 2015",
};

const settlement = {
  ...intent.settlement,
  stellarTxHash: "tx-hash",
  status: "confirmed",
};

describe("SettleDialog state transitions", () => {
  afterEach(() => {
    vi.clearAllMocks();
    statusQuery.data = undefined;
  });

  it("moves from review through signing/submitting to done", async () => {
    vi.mocked(api.createSettlement).mockResolvedValue(intent as never);
    // Hold confirmation open so the dialog is observably parked on "submitting"
    // before we complete it — otherwise the pre-resolved mocks race straight to
    // the done step and the intermediate state is never rendered.
    let confirmSettlement!: () => void;
    mutateAsync.mockReturnValue(
      new Promise((resolve) => {
        confirmSettlement = () => resolve({ settlement });
      }),
    );

    render(<SettleDialog open onClose={vi.fn()} groupId="group-1" target={target} />);
    expect(screen.getByRole("button", { name: /settle now/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /settle now/i }));
    expect(await screen.findByText(/submitting to stellar/i)).toBeInTheDocument();

    confirmSettlement();
    expect(await screen.findByText("Settled!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("surfaces the API message in the failed step when confirmation fails", async () => {
    const message = "The settlement could not be confirmed";
    vi.mocked(api.createSettlement).mockResolvedValue(intent as never);
    mutateAsync.mockRejectedValue(new ApiRequestError(502, "UPSTREAM", message));

    render(<SettleDialog open onClose={vi.fn()} groupId="group-1" target={target} />);
    fireEvent.click(screen.getByRole("button", { name: /settle now/i }));

    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
