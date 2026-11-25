import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { validateMergepayMemo } from "./validations/memo";
import { MemoVerificationBadge } from "@/components/ui/MemoVerificationBadge";

const VALID_TX_HASH = "b".repeat(64);

describe("Stellar settlement memo verification helper (#603)", () => {
  it("accepts MP:<code> memos up to 28 UTF-8 bytes and rejects oversized or unprefixed memos", () => {
    expect(validateMergepayMemo("MP:401281458", { required: true }).valid).toBe(true);
    expect(validateMergepayMemo(`MP:${"a".repeat(25)}`, { required: true }).valid).toBe(true);
    expect(validateMergepayMemo(`MP:${"a".repeat(26)}`, { required: true }).valid).toBe(false);
    expect(validateMergepayMemo("401281458", { required: true }).valid).toBe(false);
  });

  it("renders verified memo badge and network-aware Stellar Expert link", () => {
    const { rerender } = render(
      <MemoVerificationBadge
        memo="MP:dinner-8f3a"
        txHash={VALID_TX_HASH}
        network="testnet"
      />
    );
    expect(screen.getByText("MP:dinner-8f3a")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/tx/${VALID_TX_HASH}`
    );

    rerender(
      <MemoVerificationBadge
        memo="invalid-memo"
        txHash={VALID_TX_HASH}
        network="public"
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/Memo must start with "MP:"/i);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/public/tx/${VALID_TX_HASH}`
    );
  });
});
