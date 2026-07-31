/**
 * Anchor operation state management for SEP-24 flows.
 *
 * Provides:
 * - State mapping from SEP-24 anchor statuses to UI-friendly states
 * - Persistence scoped to the active wallet account (non-sensitive only)
 * - Polling configuration with bounded intervals
 * - Recovery logic for browser refreshes
 */

import type { AnchorSessionStatus } from "./types";

/**
 * UI-friendly states for anchor operations.
 * These are the states that the UI should render distinctly.
 */
export type AnchorOperationState =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown";

/**
 * Mapping from SEP-24 anchor statuses to UI states.
 *
 * SEP-24 statuses (from the API):
 * - incomplete: Initial state, user hasn't started the transfer
 * - pending_user_transfer_start: User needs to initiate the transfer
 * - pending_anchor: Anchor is processing the transfer
 * - completed: Transfer completed successfully
 * - error: Transfer failed
 * - refunded: Transfer was refunded
 */
export function mapAnchorStatusToUiState(
  status: AnchorSessionStatus
): AnchorOperationState {
  switch (status) {
    case "incomplete":
    case "pending_user_transfer_start":
      return "pending";
    case "pending_anchor":
      return "processing";
    case "completed":
      return "completed";
    case "error":
    case "refunded":
      return "failed";
    default:
      return "unknown";
  }
}

/**
 * Check if an anchor status is terminal (no further polling needed).
 */
export function isTerminalAnchorStatus(status: AnchorSessionStatus): boolean {
  return status === "completed" || status === "error" || status === "refunded";
}

/**
 * Check if an anchor status represents a user-cancelled operation.
 * SEP-24 doesn't have an explicit "cancelled" status, but we can infer it
 * from certain error conditions or user actions.
 */
export function isUserCancelledStatus(status: AnchorSessionStatus): boolean {
  // SEP-24 doesn't have a dedicated cancelled status
  // This is a placeholder for future enhancement if the API adds one
  return false;
}

/**
 * Human-readable descriptions for each UI state.
 */
export function getStateDescription(state: AnchorOperationState): string {
  switch (state) {
    case "pending":
      return "Waiting for you to complete the transfer";
    case "processing":
      return "Anchor is processing your transfer";
    case "completed":
      return "Transfer completed successfully";
    case "failed":
      return "Transfer failed";
    case "cancelled":
      return "Transfer was cancelled";
    case "unknown":
      return "Status unknown";
  }
}

/**
 * Polling configuration for anchor operations.
 */
export const ANCHOR_POLL_INTERVAL_MS = 5_000;
export const ANCHOR_POLL_MAX_PERSISTENT_FAILURES = 3;

/**
 * Returns the next poll delay (in ms) for an anchor session query,
 * or `false` to stop polling once the response reaches a terminal state.
 *
 * Similar to settlementPollInterval in queries.ts but for anchor sessions.
 */
export function anchorPollInterval(query: {
  state: {
    data?: { status?: AnchorSessionStatus };
  };
  failureCount?: number;
}): number | false {
  const status = query.state.data?.status;
  if (status && isTerminalAnchorStatus(status)) return false;

  // Bound load on a broken upstream
  const failures = query.failureCount ?? 0;
  if (failures >= ANCHOR_POLL_MAX_PERSISTENT_FAILURES) return false;

  return ANCHOR_POLL_INTERVAL_MS;
}
