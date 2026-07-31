/**
 * Validation boundary for group invite / share links.
 *
 * Route parameters, query strings and pasted codes are untrusted input:
 * they can be missing, empty, absurdly long, percent-encoded traversal
 * attempts, or markup. Everything that consumes an invite identifier —
 * the `/join/[code]` route, the join dialog, the post-login redirect —
 * parses it here *before* any group or membership request is issued.
 *
 * Nothing in this module performs I/O, so it is safe to use from server
 * components, client components and route handlers alike.
 */

/** Shortest code we will send upstream. */
export const INVITE_CODE_MIN_LENGTH = 4;
/**
 * Longest code we will send upstream. Codes are short tokens; anything
 * longer is a tampered or truncated URL, and bounding the length keeps
 * pathological input away from the API and the DOM.
 */
export const INVITE_CODE_MAX_LENGTH = 64;

/** Codes are opaque URL-safe tokens — no separators, no markup. */
const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

export type InviteCodeProblem =
  | "missing"
  | "empty"
  | "too_short"
  | "too_long"
  | "malformed";

export type InviteCodeResult =
  | { ok: true; code: string }
  | { ok: false; problem: InviteCodeProblem; message: string };

function invalid(problem: InviteCodeProblem, message: string): InviteCodeResult {
  return { ok: false, problem, message };
}

/**
 * Parse an invite code from untrusted input.
 *
 * Accepts the shapes Next.js can hand back for a dynamic segment
 * (`string`, `string[]`, `undefined`) plus anything a caller may have
 * read out of storage. Percent-encoding is decoded *before* validation,
 * so `%2e%2e%2f` is rejected as the traversal attempt it is rather than
 * slipping through as an opaque-looking token.
 */
export function parseInviteCode(raw: unknown): InviteCodeResult {
  if (raw === undefined || raw === null) {
    return invalid("missing", "This invite link is missing its code.");
  }

  if (Array.isArray(raw)) {
    // A catch-all segment: a single value is a normal code, anything
    // else means the URL had extra path segments.
    if (raw.length !== 1) {
      return invalid("malformed", "This invite link is not valid.");
    }
    return parseInviteCode(raw[0]);
  }

  if (typeof raw !== "string") {
    return invalid("malformed", "This invite link is not valid.");
  }

  // Bound the work before decoding: a megabyte-long segment should not
  // reach `decodeURIComponent`.
  if (raw.length > INVITE_CODE_MAX_LENGTH * 4) {
    return invalid("too_long", "This invite code is too long to be valid.");
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding, e.g. a truncated "%E0".
    return invalid("malformed", "This invite link is not valid.");
  }

  const code = decoded.trim();

  if (code.length === 0) {
    return invalid("empty", "This invite link is missing its code.");
  }
  if (code.length > INVITE_CODE_MAX_LENGTH) {
    return invalid("too_long", "This invite code is too long to be valid.");
  }
  if (code.length < INVITE_CODE_MIN_LENGTH) {
    return invalid("too_short", "This invite code is too short to be valid.");
  }
  if (!INVITE_CODE_PATTERN.test(code)) {
    return invalid("malformed", "This invite code contains invalid characters.");
  }

  return { ok: true, code };
}

/** Convenience predicate for call sites that only need a yes/no answer. */
export function isValidInviteCode(raw: unknown): boolean {
  return parseInviteCode(raw).ok;
}

/**
 * Build the in-app path for a validated code. Returns `null` for input
 * that does not parse, so a tampered value can never be interpolated
 * into a router push (`/join/../../somewhere`).
 */
export function inviteJoinPath(raw: unknown): string | null {
  const parsed = parseInviteCode(raw);
  if (!parsed.ok) return null;
  return `/join/${encodeURIComponent(parsed.code)}`;
}

/**
 * Whether a share URL returned by the API is safe to render as a link,
 * a QR code, or copyable text.
 *
 * Rejects non-HTTP schemes (`javascript:`, `data:`), URLs carrying
 * embedded credentials, and anything unparseable — a compromised or
 * buggy upstream must not be able to hand the UI an executable URL.
 */
export function isSafeInviteUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  // Credentials never belong in a link we display, copy or encode.
  if (url.username.length > 0 || url.password.length > 0) return false;
  return true;
}

export type InviteFailureKind =
  | "invalid_link"
  | "not_found"
  | "expired"
  | "used"
  | "sign_in_required"
  | "already_member"
  | "unavailable";

export interface InviteRecovery {
  kind: InviteFailureKind;
  title: string;
  description: string;
  /** Whether offering "Try again" makes sense for this failure. */
  retryable: boolean;
}

const RECOVERY: Record<InviteFailureKind, Omit<InviteRecovery, "kind">> = {
  invalid_link: {
    title: "Invite link is not valid",
    description:
      "The link is incomplete or has been altered. Ask a group member to send you a fresh invite.",
    retryable: false,
  },
  not_found: {
    title: "Invite not found",
    description:
      "This invite no longer exists. It may have been revoked — ask a group member for a new one.",
    retryable: false,
  },
  expired: {
    title: "Invite expired",
    description:
      "This invite is past its expiry date. Ask a group member to generate a new invite link.",
    retryable: false,
  },
  used: {
    title: "Invite already used",
    description:
      "This invite has reached its usage limit. Ask a group member for an invite of your own.",
    retryable: false,
  },
  sign_in_required: {
    title: "Sign in to join",
    description:
      "Connect your Stellar wallet to accept this invite. You will come straight back here.",
    retryable: false,
  },
  already_member: {
    title: "You are already in this group",
    description: "Nothing to do — open the group to see its expenses and balances.",
    retryable: false,
  },
  unavailable: {
    title: "Could not join right now",
    description:
      "We could not reach the invite service. Check your connection and try again.",
    retryable: true,
  },
};

function recovery(kind: InviteFailureKind): InviteRecovery {
  return { kind, ...RECOVERY[kind] };
}

/**
 * Map an API failure onto recovery guidance.
 *
 * Reads only `status` and `code` from the error and returns our own
 * copy: raw server messages are never rendered, so an upstream response
 * cannot smuggle markup or internal details into the page.
 */
export function describeInviteFailure(error: unknown): InviteRecovery {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;

  const upstreamCode = typeof code === "string" ? code.toUpperCase() : "";
  if (upstreamCode === "INVITE_USED") return recovery("used");
  if (upstreamCode === "INVITE_EXPIRED") return recovery("expired");

  if (typeof status === "number") {
    if (status === 401 || status === 403) return recovery("sign_in_required");
    if (status === 404) return recovery("not_found");
    if (status === 409) return recovery("already_member");
    if (status === 410) return recovery("expired");
    if (status === 400 || status === 422) return recovery("invalid_link");
  }

  return recovery("unavailable");
}

/** Recovery guidance for a code that never passed local validation. */
export function describeInviteCodeProblem(
  result: Extract<InviteCodeResult, { ok: false }>
): InviteRecovery {
  return {
    ...recovery("invalid_link"),
    description: `${result.message} Ask a group member to send you a fresh invite.`,
  };
}
