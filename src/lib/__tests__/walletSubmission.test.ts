import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SUBMISSION_STEPS,
  SubmissionAbortedError,
  SubmissionUnconfirmedError,
  completedStepsFor,
  describeSubmissionFailure,
  isInFlightPhase,
  phaseLabelFor,
  pollUntilConfirmed,
  type WalletSubmissionPhase,
} from "../walletSubmission";

const HASH = "f".repeat(64);

describe("the submission stepper", () => {
  it("shows the four legs a user can wait on, in order", () => {
    assert.deepEqual(
      SUBMISSION_STEPS.map((step) => step.id),
      ["preparing", "signing", "submitting", "confirm"]
    );
    assert.deepEqual(
      SUBMISSION_STEPS.map((step) => step.label),
      ["Prepare", "Sign", "Submit", "Confirm"]
    );
  });

  it("counts completed steps for each phase", () => {
    assert.equal(completedStepsFor("preparing"), 0);
    assert.equal(completedStepsFor("signing"), 1);
    assert.equal(completedStepsFor("submitting"), 2);
    assert.equal(completedStepsFor("confirming"), 3);
    assert.equal(completedStepsFor("confirmed"), SUBMISSION_STEPS.length);
    // A failure has no position of its own; the caller keeps the last phase it
    // was given so the bar still shows which leg broke.
    assert.equal(completedStepsFor("failed"), 0);
  });

  it("labels every phase as what is happening right now", () => {
    const phases: WalletSubmissionPhase[] = [
      "preparing",
      "signing",
      "submitting",
      "confirming",
      "confirmed",
      "failed",
    ];
    const labels = phases.map(phaseLabelFor);
    for (const label of labels) {
      assert.ok(label.length > 0, "every phase needs a spoken label");
    }
    assert.equal(new Set(labels).size, labels.length, "labels must differ");
    // The waiting states say what the user is waiting *for*, so they can tell
    // "keep waiting" from "go approve something".
    assert.match(phaseLabelFor("signing"), /Freighter/i);
    assert.match(phaseLabelFor("confirming"), /network/i);
  });

  it("knows which phases still have work in flight", () => {
    for (const phase of ["preparing", "signing", "submitting", "confirming"] as const) {
      assert.equal(isInFlightPhase(phase), true);
    }
    assert.equal(isInFlightPhase("confirmed"), false);
    assert.equal(isInFlightPhase("failed"), false);
    assert.equal(isInFlightPhase(null), false);
  });
});

describe("describeSubmissionFailure", () => {
  it("calls an unconfirmed transaction something to re-check, not something to retry", () => {
    const failure = describeSubmissionFailure(
      new SubmissionUnconfirmedError(HASH)
    );
    assert.equal(failure.title, "Still confirming");
    assert.equal(failure.recovery, "check");
    assert.equal(failure.code, "unconfirmed");
    assert.equal(failure.txHash, HASH);
    // Retrying here would build and sign a second changeTrust.
    assert.doesNotMatch(failure.message, /try again/i);
  });

  it("keeps the hash it is given when the error carries none", () => {
    const failure = describeSubmissionFailure(
      new SubmissionUnconfirmedError(null),
      HASH
    );
    assert.equal(failure.txHash, HASH);
  });

  it("says nothing was submitted when the user declined the signature", () => {
    const failure = describeSubmissionFailure(
      Object.assign(new Error("rejected"), { code: "user_rejected" })
    );
    assert.equal(failure.title, "Signature declined");
    assert.equal(failure.recovery, "retry");
    assert.equal(failure.code, "user_rejected");
    assert.equal(failure.txHash, null);
    assert.match(failure.message, /nothing was submitted/i);
  });

  it("routes wallet codes through the same recovery the settle flow uses", () => {
    assert.equal(
      describeSubmissionFailure(
        Object.assign(new Error("nope"), { code: "not_installed" })
      ).recovery,
      "install"
    );
    assert.equal(
      describeSubmissionFailure(
        Object.assign(new Error("locked"), { code: "locked" })
      ).recovery,
      "reconnect"
    );
    assert.equal(
      describeSubmissionFailure(
        Object.assign(new Error("gone"), { code: "disconnected" })
      ).recovery,
      "reconnect"
    );
  });

  it("names a network mismatch as itself", () => {
    const failure = describeSubmissionFailure(
      Object.assign(new Error("passphrase"), { code: "network_mismatch" })
    );
    assert.equal(failure.title, "Wrong network");
    assert.equal(failure.code, "network_mismatch");
    assert.match(failure.message, /switch/i);
  });

  it("shows the hash when the network accepted and then rejected it", () => {
    const failure = describeSubmissionFailure(
      Object.assign(new Error("op rejected"), { code: "unknown" }),
      HASH
    );
    assert.equal(failure.title, "Stellar rejected it");
    assert.equal(failure.txHash, HASH);
    assert.match(failure.message, /explorer/i);
  });

  it("names a reserve shortfall instead of a generic rejection", () => {
    // An under-funded account gets `op_low_reserve` back from Horizon, which is
    // not a sentence a user can act on — and it arrives with a hash, so this
    // has to win over the "open it in the explorer" branch below it.
    const failure = describeSubmissionFailure(
      new Error("Transaction failed with op_low_reserve"),
      HASH
    );
    assert.equal(failure.title, "Insufficient XLM reserve");
    assert.match(failure.message, /0\.5 XLM/);
    assert.equal(failure.recovery, "retry");
    assert.equal(failure.txHash, HASH);
    // The reviewed copy is the point, so the caller must not translate the
    // failure into a generic wallet message.
    assert.equal(failure.code, null);
  });

  it("recognises the reserve message the trustline helper already rewrote", () => {
    const failure = describeSubmissionFailure(
      Object.assign(
        new Error(
          "Insufficient XLM reserve. Adding a trustline requires an additional 0.5 XLM available in your wallet."
        ),
        { code: "unknown" }
      ),
      HASH
    );
    assert.equal(failure.title, "Insufficient XLM reserve");
  });

  it("reports a connectivity failure as a retry, not a broken transaction", () => {
    assert.equal(
      describeSubmissionFailure(
        Object.assign(new Error("down"), { code: "network" })
      ).title,
      "Network error"
    );
    assert.equal(
      describeSubmissionFailure(
        new TypeError("Failed to fetch")
      ).title,
      "Network error"
    );
  });

  it("shows the app's own message for a failure it has no vocabulary for", () => {
    const failure = describeSubmissionFailure(
      new Error("This asset does not accept trustlines.")
    );
    assert.equal(failure.title, "Trustline not added");
    assert.equal(failure.code, null);
    assert.equal(failure.message, "This asset does not accept trustlines.");
    assert.equal(failure.recovery, "retry");
  });

  it("never leaves an error state with no message", () => {
    const failure = describeSubmissionFailure(null);
    assert.ok(failure.message.length > 0);
    assert.ok(failure.title.length > 0);
  });
});

describe("pollUntilConfirmed", () => {
  it("resolves on the first look that finds the change", async () => {
    let calls = 0;
    await pollUntilConfirmed({
      probe: async () => {
        calls += 1;
        return true;
      },
      intervalMs: 1,
      timeoutMs: 50,
    });
    assert.equal(calls, 1);
  });

  it("keeps looking until the network shows it", async () => {
    const answers = [false, false, true];
    const attempts: number[] = [];
    await pollUntilConfirmed({
      probe: async () => answers.shift() ?? false,
      intervalMs: 1,
      timeoutMs: 50,
      onAttempt: (n) => attempts.push(n),
    });
    assert.deepEqual(attempts, [1, 2, 3]);
  });

  it("gives up with the hash so the user can check by hand", async () => {
    await assert.rejects(
      pollUntilConfirmed({
        probe: async () => false,
        intervalMs: 1,
        timeoutMs: 10,
        txHash: HASH,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SubmissionUnconfirmedError);
        assert.equal(error.txHash, HASH);
        assert.equal(error.code, "unconfirmed");
        return true;
      }
    );
  });

  it("treats a failed read as transient instead of blaming the transaction", async () => {
    // A Horizon hiccup must not turn a successful submission into a scary error.
    let calls = 0;
    await pollUntilConfirmed({
      probe: async () => {
        calls += 1;
        if (calls < 3) throw new Error("horizon unavailable");
        return true;
      },
      intervalMs: 1,
      timeoutMs: 100,
    });
    assert.equal(calls, 3);
  });

  it("stops when the caller cancels", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5);
    await assert.rejects(
      pollUntilConfirmed({
        probe: async () => false,
        intervalMs: 2,
        timeoutMs: 5_000,
        signal: controller.signal,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SubmissionAbortedError);
        return true;
      }
    );
  });

  it("checks the signal before the first probe", async () => {
    const controller = new AbortController();
    controller.abort();
    let probed = 0;
    await assert.rejects(
      pollUntilConfirmed({
        probe: async () => {
          probed += 1;
          return true;
        },
        signal: controller.signal,
      }),
      SubmissionAbortedError
    );
    assert.equal(probed, 0);
  });
});
