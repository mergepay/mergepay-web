import { API_URL } from "@/lib/constants";
import { apiError, apiSuccess, COMMON_CODES } from "@/lib/apiHelpers";
import { hashBearerToken, rateLimit } from "@/lib/rateLimiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * POST /api/auth/refresh
 *
 * Forward the current bearer token to the upstream refresh endpoint. The
 * bearer remains a server-side header and is never stored or logged.
 */
async function handle(request: Request): Promise<Response> {
  const token = bearerToken(request);
  if (!token) {
    return apiError(
      401,
      "Authentication required.",
      COMMON_CODES.UNAUTHORIZED
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    return apiError(
      502,
      "Could not refresh session.",
      COMMON_CODES.UPSTREAM
    );
  }

  if (!upstream.ok) {
    const upstreamErr = await readUpstreamError(upstream);
    return apiError(
      upstream.status || 502,
      upstreamErr.error ?? "Session refresh failed.",
      upstreamErr.code ?? COMMON_CODES.UNAUTHORIZED
    );
  }

  const data = (await upstream.json()) as Record<string, unknown>;
  return apiSuccess(data, 200);
}

export const POST = rateLimit(
  {
    limit: 10,
    windowMs: 60_000,
    keyFn: (request) => {
      const token = bearerToken(request);
      return token ? hashBearerToken(token) : null;
    },
  },
  handle
);
