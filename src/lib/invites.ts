import { differenceInMilliseconds } from "date-fns";
import { API_URL } from "./constants";
import type { Invite } from "./types";

/**
 * Default policy: any invite without an explicit `expiresAt` is
 * rejected after 7 days. Matches typical Stellar / Web3 ecosystem
 * expectations for invite link lifetimes.
 */
export const INVITE_DEFAULT_MAX_AGE_DAYS = 7;

export type InviteValidationCode =
  | "INVITE_OK"
  | "INVITE_USED"
  | "INVITE_EXPIRED"
  | "INVITE_NOT_FOUND";

export type InviteValidation =
  | { ok: true; code: "INVITE_OK"; invite: Invite }
  | {
      ok: false;
      code: Exclude<InviteValidationCode, "INVITE_OK">;
      status: 410 | 404;
      message: string;
    };

export interface ValidateInviteOptions {
  maxAgeDays?: number;
  now?: Date;
}

/**
 * Pure validation of an Invite object against the single-use / expiry
 * policy. Free of network calls so it can be unit-tested in isolation
 * and reused by the web route and future tooling.
 *
 * The upstream API is still the source of truth for atomic
 * single-use marking — this only fails fast on web-redeem attempts to
 * give callers an explicit error code and message.
 */
export function validateInviteShape(
  invite: Invite,
  options: ValidateInviteOptions = {}
): InviteValidation {
  const maxAgeDays = options.maxAgeDays ?? INVITE_DEFAULT_MAX_AGE_DAYS;
  const now = options.now ?? new Date();

  // Single-use / limited-uses check.
  if (
    invite.maxUses !== null &&
    typeof invite.maxUses === "number" &&
    invite.uses >= invite.maxUses
  ) {
    return {
      ok: false,
      code: "INVITE_USED",
      status: 410,
      message: "This invite has already been used.",
    };
  }

  if (invite.expiresAt !== null) {
    const expiresAt = new Date(invite.expiresAt);
    if (
      Number.isFinite(expiresAt.getTime()) &&
      expiresAt.getTime() <= now.getTime()
    ) {
      return {
        ok: false,
        code: "INVITE_EXPIRED",
        status: 410,
        message: "This invite has expired.",
      };
    }
  } else {
    // No explicit expiry — apply the default max-age policy.
    const createdAt = new Date(invite.createdAt);
    if (Number.isFinite(createdAt.getTime())) {
      const ageMs = differenceInMilliseconds(now, createdAt);
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
      if (ageMs > maxAgeMs) {
        return {
          ok: false,
          code: "INVITE_EXPIRED",
          status: 410,
          message: "This invite has expired.",
        };
      }
    }
  }

  return { ok: true, code: "INVITE_OK", invite };
}

export interface InviteLookupSuccess {
  ok: true;
  invite: Invite;
}
export interface InviteLookupFailure {
  ok: false;
  status: 404 | 502;
  message: string;
}
export type InviteLookupResult = InviteLookupSuccess | InviteLookupFailure;

/**
 * Look up an invite by code from the upstream API. Returns 404-shaped
 * failure when the invite cannot be found (typical when upstream does
 * not expose this endpoint yet) and 502-shaped failure on transport
 * errors — both are surfaced in the canonical error shape by callers.
 *
 * Designed for testability: `upstreamUrl` and `fetchImpl` are
 * injectable so callers can drive lookup with a stub.
 */
export async function fetchInviteByCode(
  code: string,
  token: string | null,
  upstreamUrl: string = API_URL,
  fetchImpl: typeof fetch = fetch
): Promise<InviteLookupResult> {
  const url = new URL(`/invites/${encodeURIComponent(code)}`, upstreamUrl);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetchImpl(url.toString(), { headers });
  } catch {
    return {
      ok: false,
      status: 502,
      message: "Invite service unavailable.",
    };
  }

  if (res.status === 404) {
    return { ok: false, status: 404, message: "Invite not found." };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: 404,
      message: "Invite lookup failed.",
    };
  }

  const data = (await res.json()) as { invite?: Invite };
  if (!data?.invite?.id) {
    return { ok: false, status: 404, message: "Invite not found." };
  }
  return { ok: true, invite: data.invite };
}
