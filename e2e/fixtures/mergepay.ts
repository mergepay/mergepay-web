import { expect, test as base, type Page, type Route } from "@playwright/test";

/**
 * Shared, fully offline harness for specs that need a signed-in user (#723).
 *
 * The same moving parts `group-smoke.spec.ts` builds inline — a fake MergePay
 * API behind `/api/**`, a stand-in for the Freighter extension, a Horizon
 * answer for the trustline banner — packaged as a Playwright fixture so a spec
 * gets them by asking for `api`. Every test gets its own fake, so no state
 * leaks between tests.
 *
 * Nothing leaves the machine: requests to any host other than the dev server
 * are answered here with a 404 (the app's documented "fall back" path for its
 * third-party probes) and recorded in `api.external`.
 */

// ---------------------------------------------------------------------------
// network the app under test builds against
// ---------------------------------------------------------------------------

/**
 * `NEXT_PUBLIC_STELLAR_NETWORK` decides the network for the server Playwright
 * boots. The mocked wallet has to report the same one, or the app warns
 * "Wrong network" — see the matching note in `group-smoke.spec.ts`.
 */
const TARGETS_TESTNET = /^(test(net)?)$/i.test(
  process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? ""
);
const FREIGHTER_NETWORK = TARGETS_TESTNET ? "TESTNET" : "PUBLIC";
const NETWORK_PASSPHRASE = TARGETS_TESTNET
  ? "Test SDF Network ; September 2015"
  : "Public Global Stellar Network ; September 2015";
const HORIZON_URL = TARGETS_TESTNET
  ? "https://horizon-testnet.stellar.org"
  : "https://horizon.stellar.org";
/** What the app defaults `NEXT_PUBLIC_STABLE_ASSET_ISSUER` to. */
const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const NOW = "2026-02-01T09:00:00.000Z";

export interface FakeUser {
  id: string;
  stellarPublicKey: string;
  displayName: string;
  avatarUrl: null;
  createdAt: string;
}

export const ALICE: FakeUser = {
  id: "user-1",
  stellarPublicKey: "GABXOT2RNLXHLFE5B7CCAVJ3Z567K3TALIA3567DI2XAXVBGWHXC2CVF",
  displayName: "Alice Stellar",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

export interface GroupRecord {
  id: string;
  name: string;
  description: string | null;
  createdByUserId: string;
  treasuryEnabled: false;
  treasuryAccountPublicKey: null;
  treasuryRequiredSigners: null;
  archived: false;
  createdAt: string;
}

/** One request the fake answered, as the app sent it. */
export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

/** A canned failure for the next matching request. */
interface Failure {
  method: string;
  path: string;
  status: number;
  body: unknown;
}

/**
 * Bearer token the app's expiry watcher accepts: `useTokenExpiry` reads `exp`
 * out of the payload, so an opaque string would end the session on its own.
 */
function sessionToken(userId: string): string {
  const base64url = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  })}.e2e-signature`;
}

// ---------------------------------------------------------------------------
// stateful fake API
// ---------------------------------------------------------------------------

/**
 * The slice of the MergePay API the dashboard and groups pages read: session,
 * the group list, group creation and an (empty) group detail. Groups created
 * through `POST /api/groups` are returned by the following `GET`s.
 */
export class FakeMergePayApi {
  private readonly groups = new Map<string, GroupRecord>();
  private readonly failures: Failure[] = [];
  private sequence = 0;

  /** Every `/api/**` request the app made, in order. */
  readonly requests: RecordedRequest[] = [];
  /** Same-origin API calls the fake has no handler for. Specs assert it stays empty. */
  readonly unexpected: string[] = [];
  /** Off-origin URLs that were blocked instead of reaching the network. */
  readonly external: string[] = [];

  constructor(private readonly actor: FakeUser = ALICE) {}

  /** Put a group in the list before the page loads. */
  seedGroup(name: string, description: string | null = null): GroupRecord {
    const group: GroupRecord = {
      id: this.nextId(),
      name,
      description,
      createdByUserId: this.actor.id,
      treasuryEnabled: false,
      treasuryAccountPublicKey: null,
      treasuryRequiredSigners: null,
      archived: false,
      createdAt: NOW,
    };
    this.groups.set(group.id, group);
    return group;
  }

  /** Answer the next `method path` request with `status` and `body`. */
  failNext(method: string, path: string, status: number, body: unknown): void {
    this.failures.push({ method, path, status, body });
  }

  /** Requests the app sent to `method path`. */
  callsTo(method: string, path: string): RecordedRequest[] {
    return this.requests.filter(
      (request) => request.method === method && request.path === path
    );
  }

  async dispatch(route: Route): Promise<void> {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (!isLocalHost(url.hostname)) {
      this.external.push(`${method} ${url.origin}${path}`);
      return json(route, 404, { error: "not_intercepted" });
    }

    let body: unknown = null;
    if (method !== "GET" && method !== "HEAD") {
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
    }
    this.requests.push({ method, path, body });

    const failure = this.failures.findIndex(
      (entry) => entry.method === method && entry.path === path
    );
    if (failure !== -1) {
      const [{ status, body: errorBody }] = this.failures.splice(failure, 1);
      return json(route, status, errorBody);
    }

    const payload = (body ?? {}) as Record<string, unknown>;

    // The app pings its own health route on an interval and treats a non-2xx
    // as "API degraded".
    if (path === "/api/health") {
      return json(route, 200, {
        status: "ok",
        uptime: 1,
        timestamp: new Date().toISOString(),
        dependencies: { api: "ok", stellar: "ok" },
      });
    }

    // Session: the sign-in flow runs the SEP-10 challenge against these.
    if (path === "/api/me") return json(route, 200, { user: this.actor });
    if (path === "/api/auth/challenge") {
      return json(route, 200, {
        transaction: "e2e-sep10-challenge-xdr",
        networkPassphrase: NETWORK_PASSPHRASE,
      });
    }
    if (path === "/api/auth/verify" || path === "/api/auth/refresh") {
      return json(route, 200, {
        token: sessionToken(this.actor.id),
        user: this.actor,
      });
    }
    if (path === "/api/auth/logout") return json(route, 200, { ok: true });

    // The dashboard keeps the SEP-24 modal mounted, which reads the catalogue;
    // the Anchors page also lists past sessions.
    if (path === "/api/anchors") return json(route, 200, { anchors: [] });
    if (path === "/api/anchors/sessions") {
      return json(route, 200, { sessions: [] });
    }

    // The History page: nothing recorded yet, and no further page.
    if (path === "/api/history") {
      return json(route, 200, { expenses: [], settlements: [], nextCursor: null });
    }

    if (path === "/api/groups") {
      if (method === "POST") {
        const group = this.seedGroup(
          String(payload.name ?? ""),
          payload.description ? String(payload.description) : null
        );
        return json(route, 201, { group });
      }
      return json(route, 200, {
        groups: [...this.groups.values()].map((group) => ({
          ...group,
          memberCount: 1,
          yourNet: "0.0000000",
          netAssetCode: "XLM",
        })),
      });
    }

    const groupRoute = path.match(
      /^\/api\/groups\/([^/]+)(?:\/(expenses|balances|ledger|activity))?$/
    );
    if (groupRoute && method === "GET") {
      const group = this.groups.get(groupRoute[1]);
      if (!group) return json(route, 404, { error: "group_not_found" });
      switch (groupRoute[2]) {
        case "expenses":
          return json(route, 200, { expenses: [] });
        case "balances":
          return json(route, 200, {
            balances: [
              {
                userId: this.actor.id,
                user: this.actor,
                net: "0.0000000",
                assetCode: "XLM",
              },
            ],
            suggestions: [],
          });
        case "ledger":
          return json(route, 200, { entries: [], nextCursor: null });
        case "activity":
          return json(route, 200, { activities: [] });
        default:
          return json(route, 200, {
            group,
            members: [
              {
                id: `mem-${group.id}`,
                groupId: group.id,
                userId: this.actor.id,
                role: "admin",
                joinedAt: NOW,
                user: this.actor,
              },
            ],
            yourRole: "admin",
          });
      }
    }

    this.unexpected.push(`${method} ${path}`);
    return json(route, 404, { error: "not_found", path });
  }

  private nextId(): string {
    this.sequence += 1;
    // Group ids are validated as `[A-Za-z0-9_-]` before the UI links to them.
    return `grp-e2e-${this.sequence}`;
  }
}

function isLocalHost(hostname: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname);
}

/** Any http(s) URL whose host is not the dev server. */
const OFF_ORIGIN = /^https?:\/\/(?!(?:localhost|127\.0\.0\.1|\[::1\])[:/])/;

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// browser stand-ins
// ---------------------------------------------------------------------------

/**
 * Stand in for the Freighter extension: `window.freighter` short-circuits
 * `isConnected()`, and the listener answers in the shapes
 * `@stellar/freighter-api` unpacks. `addInitScript` serializes the function,
 * so everything it needs is passed in as an argument.
 */
async function mockFreighter(page: Page, publicKey: string): Promise<void> {
  await page.addInitScript(
    ({ key, network, networkPassphrase, networkUrl }) => {
      (window as unknown as Record<string, unknown>)["freighter"] = true;

      window.addEventListener("message", (event) => {
        const data = event.data as {
          source?: string;
          messageId?: string;
          type?: string;
          transactionXdr?: string;
        };
        if (!data || data.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST") return;
        let payload: Record<string, unknown>;
        switch (data.type) {
          case "REQUEST_CONNECTION_STATUS":
            payload = { isConnected: true };
            break;
          case "REQUEST_ACCESS":
          case "REQUEST_PUBLIC_KEY":
            payload = { publicKey: key };
            break;
          case "REQUEST_NETWORK":
            payload = { network };
            break;
          case "REQUEST_NETWORK_DETAILS":
            payload = {
              networkDetails: {
                network,
                networkPassphrase,
                networkUrl,
                sorobanRpcUrl: null,
              },
            };
            break;
          case "SUBMIT_TRANSACTION":
            payload = { signedTransaction: String(data.transactionXdr ?? "") };
            break;
          default:
            return;
        }
        window.postMessage(
          {
            source: "FREIGHTER_EXTERNAL_MSG_RESPONSE",
            messagedId: data.messageId,
            ...payload,
          },
          "*"
        );
      });
    },
    {
      key: publicKey,
      network: FREIGHTER_NETWORK,
      networkPassphrase: NETWORK_PASSPHRASE,
      networkUrl: HORIZON_URL,
    }
  );
}

/** Horizon account with both settlement assets trusted, so no banner shows. */
function horizonAccount(route: Route): Promise<void> {
  return json(route, 200, {
    balances: [
      {
        asset_type: "native",
        balance: "10000.0000000",
        limit: "1000000000.0000000",
      },
      {
        asset_type: "credit_alphanum4",
        asset_code: "USDC",
        asset_issuer: USDC_ISSUER,
        balance: "500.0000000",
        limit: "1000000.0000000",
      },
    ],
  });
}

async function mountFakes(page: Page, api: FakeMergePayApi): Promise<void> {
  // Playwright tries the most recently registered route first, so the
  // catch-all for other hosts goes in before the specific handlers. Patterns
  // rather than predicate functions: a function makes Playwright intercept
  // every request, page assets included, which slows each load noticeably.
  await page.route(OFF_ORIGIN, (route) => api.dispatch(route));
  await page.route(/^https:\/\/horizon[\w.-]*\//, horizonAccount);
  await page.route("**/api/**", (route) => api.dispatch(route));
  await mockFreighter(page, ALICE.stellarPublicKey);
  // The dialogs gate their submit buttons on connectivity; intercepting every
  // request must not read as "offline".
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", {
      get: () => true,
      configurable: true,
    });
  });
}

/**
 * Sign in the way the app signs anybody in: connect the mocked wallet on
 * `/login` and let the fake answer the SEP-10 challenge. The bearer token is
 * memory-only (#543), so after this a spec navigates client-side — a full
 * page load would drop it.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-connect").click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

/**
 * `test` with an offline MergePay behind every page. The fakes are installed
 * for every test (`auto`), whether or not it asks for `api`; after the test,
 * any endpoint the fake did not know fails it.
 */
export const test = base.extend<{ api: FakeMergePayApi }>({
  api: [
    async ({ page }, use) => {
      const api = new FakeMergePayApi();
      await mountFakes(page, api);
      await use(api);
      expect(
        api.unexpected,
        `unhandled API calls:\n${api.unexpected.join("\n")}`
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
