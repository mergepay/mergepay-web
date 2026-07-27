import { NextResponse } from "next/server";

/**
 * Canonical JSON error payload returned by every API route in this repo.
 *
 * Front-end error handling can rely on this single shape:
 *     { error: string, code?: string, details?: unknown }
 *
 * Undefined `code` and `details` are omitted from the JSON response so
 * callers see the smallest possible payload when they only supply a
 * human message.
 */
export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}

export type ApiCode =
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "GONE"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL"
  | "UPSTREAM";

export const COMMON_CODES = {
  INVALID_INPUT: "INVALID_INPUT",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  GONE: "GONE",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",
  UPSTREAM: "UPSTREAM",
} as const satisfies Record<ApiCode, ApiCode>;

/**
 * Build a JSON error response with the canonical API error format.
 */
export function apiError(
  status: number,
  error: string,
  code?: string,
  details?: unknown
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = { error };
  if (code !== undefined) body.code = code;
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status });
}

/**
 * Build a JSON success response. Symmetric with `apiError` so route
 * handlers read consistently.
 */
export function apiSuccess<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

/**
 * Decode the subject claim from a JWT without verifying the signature.
 *
 * Used purely to derive a stable per-user bucket key for rate limiting.
 * The upstream API still owns verification and identity; this function
 * never makes trust decisions.
 *
 * Accepts `sub`, `userId`, or `id`, in that order, so an upstream that
 * renames its identity claim does not break rate limiting.
 */
export function decodeJwtSubject(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payloadStr = Buffer.from(parts[1] as string, "base64url").toString(
      "utf8"
    );
    const payload = JSON.parse(payloadStr) as Record<string, unknown>;
    const id = payload.sub ?? payload.userId ?? payload.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}
