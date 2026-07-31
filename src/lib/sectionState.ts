/**
 * Shared vocabulary for dashboard data sections.
 *
 * Each section (group summary, balances, expenses, history) owns its own
 * request, so each needs to answer two questions independently: which of
 * loading / empty / error / ready state to render, and what to say when
 * something failed. Keeping both answers here means a failure in one
 * section never has to blank its siblings, and error copy never leaks a
 * raw server response.
 */

import { AMOUNT_UNAVAILABLE } from "./currency";

export type SectionStatus = "loading" | "error" | "empty" | "ready";

export interface SectionQueryState {
  /** React Query `isLoading` — first load, no data yet. */
  isLoading: boolean;
  isError: boolean;
  /** Whether the section has data cached from an earlier successful load. */
  hasData: boolean;
  /** Whether the loaded data is an empty collection. */
  isEmpty?: boolean;
}

/**
 * Decide what a section should render.
 *
 * An error wins over a stale success only when there is nothing to show:
 * a section that already has data keeps rendering it (the caller pairs
 * that with a "couldn't refresh" affordance) rather than throwing the
 * user's context away on a failed background refetch.
 */
export function resolveSectionStatus(state: SectionQueryState): SectionStatus {
  if (state.isError && !state.hasData) return "error";
  if (state.isLoading && !state.hasData) return "loading";
  if (!state.hasData) return "loading";
  if (state.isEmpty) return "empty";
  return "ready";
}

export interface SectionErrorCopy {
  title: string;
  description: string;
  /** Whether a retry has any chance of succeeding. */
  retryable: boolean;
}

/**
 * User-facing copy for a failed section request.
 *
 * Only `status` is read from the error; the message we render is our own.
 * Server messages can contain internal paths, upstream identifiers or
 * echoed request data, none of which belong on screen.
 */
export function describeSectionError(
  error: unknown,
  subject = "this section"
): SectionErrorCopy {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;

  if (status === 401 || status === 403) {
    return {
      title: "Session expired",
      description: `Reconnect your wallet to load ${subject}.`,
      retryable: false,
    };
  }
  if (status === 404) {
    return {
      title: "Not available",
      description: `We could not find ${subject}.`,
      retryable: false,
    };
  }
  if (typeof status === "number" && status >= 400 && status < 500) {
    return {
      title: "Could not load",
      description: `${capitalise(subject)} could not be loaded. Refresh to try again.`,
      retryable: true,
    };
  }
  return {
    title: "Could not load",
    description: `Something went wrong loading ${subject}. Your data is safe — try again.`,
    retryable: true,
  };
}

function capitalise(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

/**
 * Placeholder for a financial figure we could not load. Shared with the
 * amount formatter so an unavailable total and an unreadable amount look
 * the same on screen.
 */
export const UNAVAILABLE_VALUE = AMOUNT_UNAVAILABLE;
export const UNAVAILABLE_VALUE_LABEL = "Unavailable";

/**
 * Format a financial figure for display, refusing to invent a number.
 *
 * A failed balance request must never render as `0` — that reads as
 * "you are square" when the truth is "we do not know". Callers pass the
 * already-formatted string; this only decides whether it may be shown.
 */
export function financialValue(
  formatted: string,
  available: boolean
): { text: string; available: boolean; label: string } {
  return available
    ? { text: formatted, available: true, label: formatted }
    : {
        text: UNAVAILABLE_VALUE,
        available: false,
        label: UNAVAILABLE_VALUE_LABEL,
      };
}
