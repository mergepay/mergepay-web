import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyWalletMessage,
  UserRejectedError,
  WalletDisconnectedError,
  WalletError,
  WalletLockedError,
  WalletNotInstalledError,
  walletMessage,
  FREIGHTER_INSTALL_URL,
} from "../stellar";

describe("wallet error classifier (#87)", () => {
  it("classifies user-rejection messages", () => {
    const samples = [
      "User denied transaction",
      "User declined to sign",
      "User cancelled the request",
      "User canceled",
      "User rejected the transaction",
      "Request was rejected",
      "User closed popup",
      "Cancelled by user",
    ];
    for (const s of samples) {
      assert.equal(
        classifyWalletMessage(s),
        "user_rejected",
        `expected user_rejected for "${s}"`
      );
    }
  });

  it("classifies locked-wallet messages", () => {
    const samples = [
      "Wallet is locked",
      "Please unlock your Freighter",
      "Unlock wallet to continue",
    ];
    for (const s of samples) {
      assert.equal(
        classifyWalletMessage(s),
        "locked",
        `expected locked for "${s}"`
      );
    }
  });

  it("classifies disconnected messages", () => {
    const samples = [
      "Wallet not connected",
      "No account selected",
      "Account changed",
      "Wallet disconnected",
    ];
    for (const s of samples) {
      assert.equal(
        classifyWalletMessage(s),
        "disconnected",
        `expected disconnected for "${s}"`
      );
    }
  });

  it("classifies network errors", () => {
    const samples = [
      "Network error",
      "Invalid network passphrase",
      "Couldn't reach wallet",
      "Failed to fetch",
    ];
    for (const s of samples) {
      assert.equal(
        classifyWalletMessage(s),
        "network",
        `expected network for "${s}"`
      );
    }
  });

  it("falls back to unknown for unrecognized messages", () => {
    assert.equal(classifyWalletMessage("Something exploded"), "unknown");
    assert.equal(classifyWalletMessage(""), "unknown");
  });
});

describe("WalletError subclasses (#87)", () => {
  it("WalletNotInstalledError carries code & default message", () => {
    const err = new WalletNotInstalledError();
    assert.equal(err.code, "not_installed");
    assert.ok(err instanceof WalletError);
    assert.match(err.message, /Freighter/);
  });

  it("WalletLockedError carries code & default message", () => {
    const err = new WalletLockedError();
    assert.equal(err.code, "locked");
    assert.ok(err.message.length > 0);
  });

  it("UserRejectedError carries code & default message", () => {
    const err = new UserRejectedError();
    assert.equal(err.code, "user_rejected");
    assert.match(err.message, /cancelled/);
  });

  it("WalletDisconnectedError carries code & default message", () => {
    const err = new WalletDisconnectedError();
    assert.equal(err.code, "disconnected");
    assert.match(err.message, /reconnect/i);
  });

  it("base WalletError defaults to unknown code", () => {
    assert.equal(new WalletError("oops").code, "unknown");
  });

  it("does not include payloads or tokens in any default message", () => {
    for (const m of [
      walletMessage("not_installed"),
      walletMessage("locked"),
      walletMessage("user_rejected"),
      walletMessage("disconnected"),
      walletMessage("network"),
      walletMessage("unknown"),
    ]) {
      assert.doesNotMatch(m, /private|secret|token|signedTxXdr|JWT/i);
    }
  });
});

describe("FREIGHTER_INSTALL_URL", () => {
  it("points to the official Freighter website", () => {
    assert.equal(FREIGHTER_INSTALL_URL, "https://freighter.app");
  });
});
