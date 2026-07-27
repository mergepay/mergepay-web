import { z } from "zod";
import { API_URL } from "@/lib/constants";
import { apiError, apiSuccess, COMMON_CODES } from "@/lib/apiHelpers";
import { getClientIp, rateLimit } from "@/lib/rateLimiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const verifySchema = z.object({
  transaction: z.string().min(1, "Missing signed SEP-10 transaction."),
});

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
 * POST /api/auth/login
 *
 * Rate-limited (10 / minute / IP) verifier for SEP-10 signed challenge
 * transactions. Forwards to mergepay-api's `/auth/verify` so the
 * upstream continues to own identity issuance and account creation.
 *
 * Returns the canonical `{ token, user }` payload on success. All
 * upstream errors are reshaped into the standard `{ error, code,
 * details? }` envelope so the front-end can rely on a single shape.
 */
async function handle(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON body.", COMMON_CODES.INVALID_INPUT);
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "Missing signed SEP-10 transaction.",
      COMMON_CODES.INVALID_INPUT,
      parsed.error.issues
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: parsed.data.transaction }),
    });
  } catch {
    return apiError(
      502,
      "Verification service unavailable.",
      COMMON_CODES.UPSTREAM
    );
  }

  if (!upstream.ok) {
    const upstreamErr = await readUpstreamError(upstream);
    return apiError(
      upstream.status || 502,
      upstreamErr.error ?? "Login failed.",
      upstreamErr.code ?? COMMON_CODES.UNAUTHORIZED
    );
  }

  const data = (await upstream.json()) as Record<string, unknown>;
  return apiSuccess(data, 200);
}

export const POST = rateLimit(
  { limit: 10, windowMs: 60_000, keyFn: (req) => getClientIp(req) },
  handle
);
