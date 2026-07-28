"use client";

/**
 * Centralized API error handling.
 *
 * One place that turns the many ways a request can fail — network errors,
 * HTTP error responses, schema-validation failures, Zod issues, and plain
 * unexpected exceptions — into a single user-friendly message, and displays
 * it via sonner. All API call sites should route errors through
 * `handleApiError` instead of hand-rolling `toast.error(...)` so messaging,
 * logging, and de-duplication stay consistent.
 */

import { toast } from "sonner";
import { ZodError } from "zod";

/** Generic fallback when nothing about the error is known. */
export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** Shown when `fetch` itself rejects (offline, DNS, CORS, ...). */
export const NETWORK_ERROR_MESSAGE =
  "Network error. Please check your connection.";

/** An error response returned by the Mergepay API (or a wrapped network failure). */
export class ApiRequestError extends Error {
  code: string;
  /** HTTP status, or 0 when the request never reached the server. */
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Thrown when a response with a successful HTTP status fails client-side
 * Zod schema validation. Retrying cannot help — the payload shape diverged
 * from the contract the client was built against — so React Query's retry
 * gate treats it as terminal (see providers.tsx / queryClient.ts).
 */
export class ApiValidationError extends Error {
  readonly code = "invalid_response";
  readonly status = 200;

  constructor(message = "Received an unexpected response from the server.") {
    super(message);
    this.name = "ApiValidationError";
  }
}

/** True for intentional cancellations (React Query unmount/refetch aborts). */
export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * Errors that already produced a toast. The fetch wrapper in api.ts toasts
 * network failures before re-throwing; without this set, a calling
 * catch-block would show the same message a second time.
 */
const notifiedErrors = new WeakSet<object>();

/**
 * Identical messages are not re-toasted within this window. Prevents toast
 * spam when a polling query keeps failing while the device is offline.
 */
const TOAST_DEDUPE_WINDOW_MS = 10_000;
const recentToasts = new Map<string, number>();

/**
 * Extract a concise, human-readable message from any thrown value.
 *
 * Pure — never toasts or logs. Use `handleApiError` for the full
 * notify-and-log behavior.
 *
 * @returns The message, or an empty string for aborted requests (callers
 *          should treat "" as "stay silent").
 */
export function apiErrorMessage(
  error: unknown,
  fallback: string = GENERIC_ERROR_MESSAGE
): string {
  if (isAbortError(error)) return "";
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof ApiValidationError) return error.message;
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ");
  }
  // Plain Error instances (including WalletError) carry user-safe messages.
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export interface HandleApiErrorOptions {
  /**
   * Return the message without toasting. For callers that render the error
   * inline (e.g. inside a dialog) or perform their own recovery.
   */
  silent?: boolean;
}

/**
 * Central entry point: derive a message from `error`, show it as a toast
 * (unless suppressed), log it for debugging, and return the message so the
 * caller can also render it inline if needed.
 *
 * @param error    The caught value (type unknown, as in any catch block).
 * @param context  Fallback message used when the error carries no usable
 *                 message of its own (e.g. "Could not create group").
 */
export function handleApiError(
  error: unknown,
  context: string = GENERIC_ERROR_MESSAGE,
  options?: HandleApiErrorOptions
): string {
  const message = apiErrorMessage(error, context);

  // Intentional cancellations are not errors from the user's perspective.
  if (!message) return message;

  logApiError(error, message);

  if (options?.silent) return message;

  // De-dupe: the same error instance is only toasted once (e.g. the fetch
  // wrapper already reported a network failure before re-throwing).
  if (typeof error === "object" && error !== null) {
    if (notifiedErrors.has(error)) return message;
    notifiedErrors.add(error);
  }

  // De-dupe: identical messages within a short window (polling failures).
  const now = Date.now();
  const lastShown = recentToasts.get(message);
  if (lastShown !== undefined && now - lastShown < TOAST_DEDUPE_WINDOW_MS) {
    return message;
  }
  recentToasts.set(message, now);

  toast.error(message);
  return message;
}

/**
 * Mark an error as already displayed so a later `handleApiError` call with
 * the same instance does not toast again. Used by the fetch wrapper, which
 * notifies network failures at the point they occur.
 */
export function markErrorNotified(error: unknown): void {
  if (typeof error === "object" && error !== null) {
    notifiedErrors.add(error);
  }
}

/**
 * Convert a rejection thrown by `fetch` itself into a throwable error.
 * Network-level failures become an `ApiRequestError` with status 0 and are
 * toasted here once; aborts pass through untouched and silent.
 */
export function networkFailure(
  error: unknown,
  options?: HandleApiErrorOptions
): Error {
  if (isAbortError(error)) {
    return error instanceof Error ? error : new Error("Request aborted");
  }
  const err = new ApiRequestError(0, "network_error", NETWORK_ERROR_MESSAGE);
  handleApiError(err, undefined, options);
  return err;
}

/** Structured debug log — never includes response bodies or headers. */
function logApiError(error: unknown, message: string): void {
  if (process.env.NODE_ENV === "production") return;
  const meta: Record<string, unknown> = { message };
  if (error instanceof ApiRequestError) {
    meta.status = error.status;
    meta.code = error.code;
  } else if (error instanceof Error) {
    meta.name = error.name;
  }
  // eslint-disable-next-line no-console
  console.error("[mergepay] API error", meta);
}
