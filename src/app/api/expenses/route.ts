import { z } from "zod";
import { API_URL } from "@/lib/constants";
import {
  apiError,
  apiSuccess,
  COMMON_CODES,
} from "@/lib/apiHelpers";
import { hashBearerToken, rateLimit } from "@/lib/rateLimiter";
import {
  decodeCursor,
  fetchExpensesPage,
  parseExpensesQuery,
} from "@/lib/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createExpenseSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(80),
  amount: z.string().min(1, "Amount is required"),
  assetCode: z.string().min(1, "assetCode is required"),
  assetIssuer: z.string().nullable().optional(),
  splitType: z.enum(["equal", "custom", "percentage"]),
  shares: z
    .array(
      z.object({
        userId: z.string().min(1),
        amount: z.string().optional(),
        percent: z.number().optional(),
      })
    )
    .min(1, "At least one share is required"),
  payerUserId: z.string().optional(),
  memo: z.string().nullable().optional(),
  receiptUrl: z.string().nullable().optional(),
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
 * GET /api/expenses?groupId=...&limit=...&cursor=...
 *
 * Cursor-paginated list of expenses for a group. `limit` is clamped to
 * 100 (default 20). `cursor` is an opaque base64url payload of
 * `{ createdAt, id }` issued by a previous page response.
 */
async function handleGet(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let params;
  try {
    params = parseExpensesQuery(url.searchParams);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return apiError(
        400,
        "Invalid query parameters.",
        COMMON_CODES.INVALID_INPUT,
        err.issues
      );
    }
    return apiError(
      400,
      "Invalid query parameters.",
      COMMON_CODES.INVALID_INPUT
    );
  }

  if (params.cursor && !decodeCursor(params.cursor)) {
    return apiError(400, "Invalid cursor.", COMMON_CODES.INVALID_INPUT);
  }

  const token = bearerToken(request);
  try {
    const page = await fetchExpensesPage(params.groupId, token, {
      limit: params.limit,
      cursor: params.cursor,
    });
    return apiSuccess(page, 200);
  } catch {
    return apiError(502, "Could not load expenses.", COMMON_CODES.UPSTREAM);
  }
}

/**
 * POST /api/expenses?groupId=...
 *
 * Rate-limited (30 / minute / authenticated user) expense creation
 * endpoint. Forwarded verbatim to the upstream after
 * authorization-bearing validation.
 */
async function handlePost(request: Request): Promise<Response> {
  const token = bearerToken(request);
  if (!token) {
    return apiError(
      401,
      "Authentication required.",
      COMMON_CODES.UNAUTHORIZED
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Invalid JSON body.", COMMON_CODES.INVALID_INPUT);
  }

  const parsed = createExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "Invalid expense payload.",
      COMMON_CODES.INVALID_INPUT,
      parsed.error.issues
    );
  }

  const url = new URL(request.url);
  const groupId = url.searchParams.get("groupId");
  if (!groupId) {
    return apiError(400, "Missing groupId.", COMMON_CODES.INVALID_INPUT);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/groups/${groupId}/expenses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(parsed.data),
    });
  } catch {
    return apiError(502, "Could not create expense.", COMMON_CODES.UPSTREAM);
  }

  if (!upstream.ok) {
    const upstreamErr = await readUpstreamError(upstream);
    return apiError(
      upstream.status || 502,
      upstreamErr.error ?? "Could not create expense.",
      upstreamErr.code ?? COMMON_CODES.INTERNAL
    );
  }

  const data = (await upstream.json()) as Record<string, unknown>;
  return apiSuccess(data, 201);
}

export const GET = handleGet;

export const POST = rateLimit(
  {
    limit: 30,
    windowMs: 60_000,
    // Bucket by a SHA-256 hash of the full bearer token. Decoding JWT
    // claims here would require a verification secret we don't have,
    // and the previous fallback (token prefix) let callers rotate
    // keys to evade the limit. See `hashBearerToken` for details.
    keyFn: (req) => {
      const token = bearerToken(req);
      return token ? hashBearerToken(token) : null;
    },
  },
  handlePost
);
