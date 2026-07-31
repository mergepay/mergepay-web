import { z } from "zod";
import { API_URL } from "@/lib/constants";
import { apiError, apiSuccess, COMMON_CODES } from "@/lib/apiHelpers";
import { fetchInviteByCode, validateInviteShape } from "@/lib/invites";
import { parseInviteCode } from "@/lib/inviteLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const redeemSchema = z.object({
  code: z.string().trim().min(1, "Missing invite code."),
});

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const trimmed = header.slice(7).trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function readUpstreamError(
  res: Response
): Promise<{ error?: string; code?: string }> {
  try {
    const body = (await res.json()) as { error?: unknown; code?: unknown };
    return {
      error: typeof body?.error === "string" ? body.error : undefined,
      code: typeof body?.code === "string" ? body.code : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * POST /api/invites/redeem
 *
 * Pre-validates an invite token server-side (single-use, ≤ 7 day age
 * when no explicit expiry, explicit `expiresAt` in the past) before
 * forwarding to the upstream `/groups/join`, which atomically marks
 * the invite used and adds the caller to the group.
 *
 * The upstream is the source of truth for atomicity; our role is to
 * fail fast on obvious abuses with 410 Gone and surface the canonical
 * `INVITE_USED` / `INVITE_EXPIRED` codes so the front-end can show the
 * right message.
 *
 * Race window note: between our `fetchInviteByCode` pre-check and the
 * upstream `/groups/join` call, a concurrent caller could consume the
 * invite. We forward upstream `410` responses unchanged — atomicity
 * for the "mark used" guarantee lives in mergepay-api, not here.
 */
async function handle(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON body.", COMMON_CODES.INVALID_INPUT);
  }

  const parsed = redeemSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "Missing invite code.",
      COMMON_CODES.INVALID_INPUT,
      parsed.error.issues
    );
  }

  // Shape check before any upstream traffic: a malformed identifier is
  // rejected here rather than forwarded to the invite service.
  const code = parseInviteCode(parsed.data.code);
  if (!code.ok) {
    return apiError(400, code.message, COMMON_CODES.INVALID_INPUT, {
      problem: code.problem,
    });
  }

  const token = bearerToken(request);

  const lookup = await fetchInviteByCode(code.code, token);
  if (!lookup.ok) {
    if (lookup.status === 502) {
      return apiError(502, lookup.message, COMMON_CODES.UPSTREAM);
    }
    return apiError(404, lookup.message, COMMON_CODES.NOT_FOUND);
  }

  const validation = validateInviteShape(lookup.invite);
  if (!validation.ok) {
    return apiError(validation.status, validation.message, validation.code);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/groups/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ code: code.code }),
    });
  } catch {
    return apiError(502, "Could not redeem invite.", COMMON_CODES.UPSTREAM);
  }

  // The upstream may also return 410 if the invite was used between
  // the lookup and the join — surface that to the caller too.
  if (upstream.status === 410) {
    return apiError(
      410,
      "This invite has expired or been used.",
      COMMON_CODES.GONE,
      { reason: "upstream_410" }
    );
  }

  if (!upstream.ok) {
    const upstreamErr = await readUpstreamError(upstream);
    return apiError(
      upstream.status || 502,
      upstreamErr.error ?? "Could not redeem invite.",
      upstreamErr.code ?? COMMON_CODES.INTERNAL
    );
  }

  const data = (await upstream.json()) as Record<string, unknown>;
  return apiSuccess(data, 200);
}

export const POST = handle;
