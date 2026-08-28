/**
 * Single-flight submission helpers.
 *
 * React state updates are asynchronous, so `isPending` from a React Query
 * mutation (or a `useState` flag mirroring it) is not a reliable guard
 * against two activations that land in the same tick — a double-click, an
 * Enter auto-repeat, or a touch device firing a click after a tap. These
 * helpers provide a *synchronous* latch that flips before any `await`, so a
 * second activation is rejected deterministically.
 *
 * The module is intentionally free of React imports: components hold a gate
 * in a ref, and the behaviour stays unit-testable in isolation.
 */

export interface SubmissionGate {
  /**
   * Claim the gate. Returns `true` for the caller that acquired it and
   * `false` for every activation that arrives while a submission is in
   * flight.
   */
  begin(): boolean;
  /** Release the gate so the form can be corrected and retried. */
  end(): void;
  /** Whether a submission currently holds the gate. */
  readonly active: boolean;
}

export function createSubmissionGate(): SubmissionGate {
  let inFlight = false;
  return {
    begin() {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    end() {
      inFlight = false;
    },
    get active() {
      return inFlight;
    },
  };
}

export type SubmitAttempt<T> =
  /** Rejected because another submission already holds the gate. */
  | { status: "blocked" }
  | { status: "success"; data: T }
  | { status: "error"; error: unknown };

/**
 * Run `task` at most once per gate acquisition.
 *
 * The gate is released in a `finally` block, so a failed request leaves the
 * form ready for an immediate retry with the values the user already typed.
 * Errors are returned rather than thrown so callers handle success and
 * failure in one place, without a stray rejection escaping the handler.
 */
export async function submitOnce<T>(
  gate: SubmissionGate,
  task: () => Promise<T>
): Promise<SubmitAttempt<T>> {
  if (!gate.begin()) return { status: "blocked" };
  try {
    return { status: "success", data: await task() };
  } catch (error) {
    return { status: "error", error };
  } finally {
    gate.end();
  }
}

/**
 * Whether a keydown should be swallowed instead of submitting the form.
 *
 * Browsers submit a form on Enter without routing through the submit
 * button's `disabled` state in every case (implicit submission, and
 * auto-repeat while the key is held), so keyboard activation needs the same
 * protection as pointer activation.
 */
export function shouldSuppressSubmitKey(
  event: { key: string; repeat?: boolean },
  pending: boolean
): boolean {
  if (event.key !== "Enter") return false;
  return pending || event.repeat === true;
}
