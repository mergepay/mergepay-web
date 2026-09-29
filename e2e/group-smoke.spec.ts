import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * End-to-end smoke journey for the group lifecycle (#548).
 *
 * Where `group-expense-settlement.spec.ts` pins each screen's rendering with
 * static fixtures, this spec walks the *chain* a real user walks: create a
 * group, invite someone into it, have that second person redeem the invite,
 * then record an expense across both members and watch the two sides of the
 * ledger agree. Each leg has to hand off to the next — a group id that reaches
 * the detail page, an invite code that resolves to that group, a member list
 * the expense form then splits across.
 *
 * The backend is a small stateful fake rather than a table of frozen payloads:
 * `POST /api/groups` really adds a group that the following `GET` returns, and
 * `POST /api/groups/join` really makes Bob a member that the expense form
 * offers. That is what makes the journey testable at all — with static mocks,
 * step 5 could pass while step 2 produced something step 3 never consumed.
 *
 * Two details worth knowing before editing:
 *
 * - Requests are intercepted at the browser boundary with a whole-of-path
 *   glob, so the Next.js BFF under `src/app/api` never runs and no server is
 *   needed.
 * - The fake is answered *per browser context*: `handle(actor)` binds that
 *   context's identity. A restored session carries no `Authorization` header
 *   (`getToken()` only returns a token minted in the current document), so
 *   reading identity off the headers would silently make Bob a second Alice.
 *
 * Nothing here waits on `networkidle`. The pages poll in the background — the
 * activity feed, `/api/health`, the Horizon and coin-price probes — so "quiet"
 * is a question about the network's mood, not about the journey; the sibling
 * spec's four `networkidle` waits time out on a cold machine. Every wait here
 * names the locator or the response it is actually for.
 */

// ---------------------------------------------------------------------------
// identities and the amounts the journey runs on
// ---------------------------------------------------------------------------

/**
 * The network the app under test builds against.
 *
 * `NEXT_PUBLIC_STELLAR_NETWORK` decides it for the dev server Playwright boots
 * as well as for the app: it is unset on the local and CI E2E runs (the app
 * then targets Mainnet — CI only sets `testnet`, and only on its build step).
 * The mocked wallet has to answer with the same one — the app compares
 * passphrases and warns "Wrong network" against anything else.
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

const ASSET = "XLM";
const GROUP_NAME = "Smoke Road Trip";
const EXPENSE_TITLE = "Highway tolls";
/** Two members, so the equal split is exactly 45 each — no rounding to forgive. */
const EXPENSE_AMOUNT = "90";
const EACH_SHARE = "45.0000000";
/** `Money` renders 7-decimal values with the app's 2-decimal floor. */
const EACH_SHARE_SHOWN = "45.00 XLM";
const TOTAL_SHOWN = "90.00 XLM";

interface FakeUser {
  id: string;
  stellarPublicKey: string;
  displayName: string;
  avatarUrl: null;
  createdAt: string;
}

const ALICE: FakeUser = {
  id: "user-1",
  stellarPublicKey:
    "GABXOT2RNLXHLFE5B7CCAVJ3Z567K3TALIA3567DI2XAXVBGWHXC2CVF",
  displayName: "Alice Stellar",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const BOB: FakeUser = {
  id: "user-2",
  stellarPublicKey:
    "GB7ETITECXAE47D6BSHV6IH5V4MAPVPWOF7KJEEFBCVGWHFWCAZW22MQ",
  displayName: "Bob Testnet",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// decimal strings
// ---------------------------------------------------------------------------

/**
 * Amounts cross the wire as 7-decimal strings, so the fake splits in stroops.
 * `90 / 2` has to come back as `45.0000000`, not `44.9999999` — a float here
 * would make the balances disagree with the ledger for a reason that has
 * nothing to do with the app under test.
 */
function toUnits(value: string): bigint {
  const raw = value.trim();
  if (!raw) return 0n;
  const negative = raw.startsWith("-");
  const [whole = "", fraction = ""] = raw.replace(/^[+-]/, "").split(".");
  const units = BigInt(`${whole || "0"}${fraction.padEnd(7, "0").slice(0, 7)}`);
  return negative ? -units : units;
}

function fromUnits(units: bigint): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(8, "0");
  const text = `${digits.slice(0, -7)}.${digits.slice(-7)}`;
  return negative ? `-${text}` : text;
}

// ---------------------------------------------------------------------------
// stateful fake API
// ---------------------------------------------------------------------------

interface MemberRecord {
  userId: string;
  role: "admin" | "member";
  joinedAt: string;
}

interface ShareRecord {
  id: string;
  expenseId: string;
  userId: string;
  user: FakeUser;
  shareAmount: string;
  status: "pending" | "settling" | "settled";
}

interface ExpenseRecord {
  id: string;
  groupId: string;
  payerUserId: string;
  payer: FakeUser;
  title: string;
  description: string | null;
  amount: string;
  assetCode: string;
  assetIssuer: null;
  splitType: "equal";
  memo: string | null;
  receiptUrl: null;
  createdAt: string;
  shares: ShareRecord[];
}

interface InviteRecord {
  id: string;
  groupId: string;
  code: string;
  url: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  createdAt: string;
}

interface GroupRecord {
  id: string;
  name: string;
  description: string | null;
  createdByUserId: string;
  treasuryEnabled: false;
  treasuryAccountPublicKey: null;
  treasuryRequiredSigners: null;
  archived: false;
  createdAt: string;
  members: MemberRecord[];
  expenses: ExpenseRecord[];
  inviteCodes: string[];
}

const NOW = "2026-02-01T09:00:00.000Z";

/**
 * Mint a bearer token the app's own expiry watcher accepts.
 *
 * `useTokenExpiry` reads the `exp` claim out of the payload and signs the user
 * out when it passes, so an opaque string would end the session on its own
 * timetable — and the journey, which lives entirely inside one session, would
 * fall over half way through.
 */
function sessionToken(userId: string): string {
  const base64url = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  })}.e2e-signature`;
}

/**
 * A minimal, in-process MergePay API: groups, invites, membership, expenses and
 * the balances derived from them. Only the endpoints this journey touches are
 * implemented; anything else is recorded in `unexpected` and answered 404.
 */
class FakeMergePayApi {
  private readonly groups = new Map<string, GroupRecord>();
  private readonly invites = new Map<string, InviteRecord>();
  private sequence = 0;

  /**
   * Requests the fake had no handler for. The journey asserts this stays empty,
   * so a UI change that starts calling a new endpoint shows up as a named
   * failure here instead of as a validation error somewhere downstream.
   */
  readonly unexpected: string[] = [];

  /** One route handler per browser context, with that context's user bound. */
  handle(actor: FakeUser) {
    return (route: Route) => this.dispatch(route, actor);
  }

  private async dispatch(route: Route, actor: FakeUser): Promise<void> {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;
    const body =
      method === "POST"
        ? ((request.postDataJSON() ?? {}) as Record<string, unknown>)
        : {};

    // The app pings its own health route on an interval, and treats a non-2xx
    // as "API degraded". Answering it honestly keeps that indicator out of the
    // journey, where it would only be noise.
    if (path === "/api/health") {
      return this.json(route, 200, {
        status: "ok",
        uptime: 1,
        timestamp: new Date().toISOString(),
        dependencies: { api: "ok", stellar: "ok" },
      });
    }

    // Session — the guard resolves these before any group data, and the
    // journey now signs in through them rather than writing a session in.
    if (path === "/api/me") return this.json(route, 200, { user: actor });
    if (path === "/api/auth/refresh" || path === "/api/auth/verify") {
      return this.json(route, 200, {
        token: sessionToken(actor.id),
        user: actor,
      });
    }
    if (path === "/api/auth/challenge") {
      // This fake is also the verifier, so the envelope it hands back to be
      // signed only has to be opaque.
      return this.json(route, 200, {
        transaction: "e2e-sep10-challenge-xdr",
        networkPassphrase: NETWORK_PASSPHRASE,
      });
    }
    if (path === "/api/auth/logout") {
      return this.json(route, 200, { ok: true });
    }

    // The dashboard holds the SEP-24 modal mounted, and that hook reads the
    // anchor catalogue as soon as it mounts — open or not, so every sign-in
    // asks. Empty is the honest answer for a journey that deposits nothing:
    // the modal stays closed and no step depends on what it would list.
    if (path === "/api/anchors") {
      return this.json(route, 200, { anchors: [] });
    }

    if (path === "/api/groups") {
      if (method === "POST") return this.createGroup(route, actor, body);
      return this.json(route, 200, { groups: this.listGroups(actor) });
    }

    // Redeeming an invite lives at `/groups/join`, which has to be matched
    // before `/groups/{id}` reads the word "join" as a group identifier.
    if (path === "/api/groups/join" && method === "POST") {
      return this.joinByCode(route, actor, String(body.code ?? ""));
    }

    const inviteByCode = path.match(/^\/api\/invites\/([^/]+)$/);
    if (inviteByCode) {
      const invite = this.invites.get(decodeURIComponent(inviteByCode[1]));
      return invite
        ? this.json(route, 200, { invite })
        : this.json(route, 404, { error: "invite_not_found" });
    }

    const groupRoute = path.match(
      /^\/api\/groups\/([^/]+)(?:\/(expenses|balances|ledger|activity|invite))?$/
    );
    if (groupRoute) {
      const group = this.groups.get(groupRoute[1]);
      if (!group) return this.json(route, 404, { error: "group_not_found" });
      const section = groupRoute[2];
      if (section === "expenses") {
        return method === "POST"
          ? this.addExpense(route, actor, group, body)
          : this.json(route, 200, { expenses: group.expenses });
      }
      if (section === "balances") {
        return this.json(route, 200, {
          balances: this.balances(group),
          suggestions: [],
        });
      }
      if (section === "ledger") {
        return this.json(route, 200, {
          entries: group.expenses.map((expense) => ({
            type: "expense",
            createdAt: expense.createdAt,
            expense,
          })),
          nextCursor: null,
        });
      }
      if (section === "activity") {
        return this.json(route, 200, { activities: [] });
      }
      if (section === "invite") {
        return this.createInvite(route, request.url(), group, body);
      }
      return this.json(route, 200, this.detail(group, actor));
    }

    // Requests are intercepted by a whole-of-path glob, so third-party polls
    // (CoinGecko prices) land here too. They are not this API's contract: a 404
    // is the app's documented "fall back to the indicative rate" path, so it is
    // answered quietly instead of counted as a gap in the fake.
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)) {
      return this.json(route, 404, { error: "not_intercepted" });
    }

    this.unexpected.push(`${method} ${path}`);
    return this.json(route, 404, { error: "not_found", path });
  }

  private json(route: Route, status: number, body: unknown): Promise<void> {
    return route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    // Underscores and hyphens only: group ids and invite codes are both
    // validated as `[A-Za-z0-9_-]` before the UI will put them in a link.
    return `${prefix}-smoke-${this.sequence}`;
  }

  private userById(id: string): FakeUser {
    const known = [ALICE, BOB].find((user) => user.id === id);
    return known ?? {
      id,
      stellarPublicKey: id,
      displayName: id,
      avatarUrl: null,
      createdAt: NOW,
    };
  }

  // -- groups ---------------------------------------------------------------

  private createGroup(
    route: Route,
    actor: FakeUser,
    body: Record<string, unknown>
  ): Promise<void> {
    const id = this.nextId("grp");
    const group: GroupRecord = {
      id,
      // Echoed from the request, so the spec can prove the dialog's text is
      // what reached the server rather than whatever a mock returned.
      name: String(body.name ?? ""),
      description: body.description ? String(body.description) : null,
      createdByUserId: actor.id,
      treasuryEnabled: false,
      treasuryAccountPublicKey: null,
      treasuryRequiredSigners: null,
      archived: false,
      createdAt: NOW,
      members: [{ userId: actor.id, role: "admin", joinedAt: NOW }],
      expenses: [],
      inviteCodes: [],
    };
    this.groups.set(id, group);
    return this.json(route, 201, { group });
  }

  private listGroups(actor: FakeUser) {
    return [...this.groups.values()]
      .filter((group) => group.members.some((member) => member.userId === actor.id))
      .map((group) => ({
        ...group,
        memberCount: group.members.length,
        yourNet: this.netFor(group, actor.id),
        netAssetCode: ASSET,
      }));
  }

  private detail(group: GroupRecord, actor: FakeUser) {
    return {
      group,
      members: group.members.map((member) => ({
        id: `mem-${group.id}-${member.userId}`,
        groupId: group.id,
        userId: member.userId,
        role: member.role,
        joinedAt: member.joinedAt,
        user: this.userById(member.userId),
      })),
      yourRole:
        group.members.find((member) => member.userId === actor.id)?.role ??
        "member",
    };
  }

  // -- invites --------------------------------------------------------------

  private createInvite(
    route: Route,
    requestUrl: string,
    group: GroupRecord,
    body: Record<string, unknown>
  ): Promise<void> {
    const code = this.nextId("code");
    const maxUses =
      body.maxUses === undefined || body.maxUses === null
        ? null
        : Number(body.maxUses);
    const hours =
      body.expiresInHours === undefined || body.expiresInHours === null
        ? null
        : Number(body.expiresInHours);
    const invite: InviteRecord = {
      id: this.nextId("inv"),
      groupId: group.id,
      code,
      // A same-origin deep link, the way an issuing backend would build one.
      url: `${new URL(requestUrl).origin}/join/${code}?group=${group.id}`,
      expiresAt: hours
        ? new Date(Date.now() + hours * 3_600_000).toISOString()
        : null,
      maxUses,
      uses: 0,
      createdAt: NOW,
    };
    this.invites.set(code, invite);
    group.inviteCodes.push(code);
    return this.json(route, 201, { invite });
  }

  private joinByCode(route: Route, actor: FakeUser, code: string): Promise<void> {
    const invite = this.invites.get(code);
    if (!invite) return this.json(route, 404, { error: "invite_not_found" });
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      return this.json(route, 410, { error: "invite_expired" });
    }
    if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
      return this.json(route, 410, { error: "invite_exhausted" });
    }
    const group = this.groups.get(invite.groupId);
    if (!group) return this.json(route, 404, { error: "group_not_found" });

    if (!group.members.some((member) => member.userId === actor.id)) {
      group.members.push({ userId: actor.id, role: "member", joinedAt: NOW });
    }
    invite.uses += 1;
    return this.json(route, 200, { group });
  }

  // -- expenses -------------------------------------------------------------

  private addExpense(
    route: Route,
    actor: FakeUser,
    group: GroupRecord,
    body: Record<string, unknown>
  ): Promise<void> {
    const participants = Array.isArray(body.shares)
      ? (body.shares as { userId: string }[])
      : [];
    const amount = String(body.amount ?? "0");
    const payerUserId = String(body.payerUserId ?? actor.id);
    const expenseId = this.nextId("exp");

    const total = toUnits(amount);
    const divisor = BigInt(participants.length || 1);
    const each = total / divisor;
    // The first participant absorbs the remainder, so the shares always add
    // back up to the posted total.
    const remainder = total - each * divisor;

    const expense: ExpenseRecord = {
      id: expenseId,
      groupId: group.id,
      payerUserId,
      payer: this.userById(payerUserId),
      title: String(body.title ?? ""),
      description: body.description ? String(body.description) : null,
      amount,
      assetCode: String(body.assetCode ?? ASSET),
      assetIssuer: null,
      splitType: "equal",
      memo: body.memo ? String(body.memo) : null,
      receiptUrl: null,
      createdAt: NOW,
      shares: participants.map((participant, index) => ({
        id: `${expenseId}-${participant.userId}`,
        expenseId,
        userId: participant.userId,
        user: this.userById(participant.userId),
        shareAmount: fromUnits(each + (index === 0 ? remainder : 0n)),
        // Nobody owes themselves: the payer's own slice is already covered.
        status:
          participant.userId === payerUserId
            ? ("settled" as const)
            : ("pending" as const),
      })),
    };
    group.expenses.unshift(expense);
    return this.json(route, 201, { expense });
  }

  private netFor(group: GroupRecord, userId: string): string {
    let net = 0n;
    for (const expense of group.expenses) {
      const share = expense.shares.find((entry) => entry.userId === userId);
      if (share) net -= toUnits(share.shareAmount);
      if (expense.payerUserId === userId) net += toUnits(expense.amount);
    }
    return fromUnits(net);
  }

  private balances(group: GroupRecord) {
    return group.members.map((member) => ({
      userId: member.userId,
      user: this.userById(member.userId),
      net: this.netFor(group, member.userId),
      assetCode: ASSET,
    }));
  }
}

// ---------------------------------------------------------------------------
// browser fixtures
// ---------------------------------------------------------------------------

/**
 * Stand in for the Freighter extension.
 *
 * `window.freighter` short-circuits `isConnected()`; the listener answers the
 * calls the app makes against a shared account, in the shapes
 * `@stellar/freighter-api` unpacks (`networkDetails` wrapper, `messagedId`
 * echo). Everything it needs is passed in as an argument — `addInitScript`
 * serializes the function, so module scope does not travel with it.
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
        const { messageId, type } = data;
        let payload: Record<string, unknown> = {};
        switch (type) {
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
            messagedId: messageId,
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

/**
 * Sign in the way the app signs anybody in: connect the mocked wallet on
 * `/login`, run the SEP-10 challenge, and let the fake hand back a token.
 *
 * There is no shorter way in any more. #543 made the bearer token memory-only —
 * it never reaches Web Storage, and the store's `merge` deliberately ignores a
 * hand-written one — so a session cannot be seeded before the page boots: the
 * guard reads back only a public identity and sends anybody without a live
 * token to `/login`. Driving the real flow is also what makes the journey worth
 * running, because it proves `AuthGuard`, the expiry watcher and the wallet mock
 * agree. Everything after this has to navigate client-side, for the same reason:
 * a full page load would drop the token and log the journey out.
 */

/** Click the connect button on the `/login` the browser is already standing on. */
async function connectWallet(page: Page): Promise<void> {
  await page.getByTestId("login-connect").click();
  // `/dashboard` normally, or the invite this context arrived on — see
  // `mergepay.pendingInvite` in the visitor leg below.
  await expect(page).toHaveURL(/\/(?:dashboard|join\/[\w-]+)$/);
}

/** From wherever the context is now to a signed-in `/dashboard`. */
async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await connectWallet(page);
}

/**
 * Answer Horizon so the trustline banner resolves offline.
 *
 * The banner reads the connected account's balances from Horizon on mount. Left
 * alone, it would call the real network for a key that belongs to nobody, so
 * the journey would depend on a public RPC being up. This account trusts both
 * configured settlement assets, which keeps the banner quiet.
 */
async function mockHorizon(page: Page): Promise<void> {
  await page.route(
    (url) => url.hostname.includes("horizon"),
    (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
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
        }),
      })
  );
}

/** Put one context's user behind the shared fake. */
async function mountJourney(
  page: Page,
  api: FakeMergePayApi,
  user: FakeUser
): Promise<void> {
  await mockFreighter(page, user.stellarPublicKey);
  await mockHorizon(page);
  await page.route("**/api/**", api.handle(user));
  // The dialogs gate their submit buttons on connectivity, and intercepting
  // every request must not read as "offline".
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", {
      get: () => true,
      configurable: true,
    });
  });
}

// ---------------------------------------------------------------------------
// the journey
// ---------------------------------------------------------------------------

test.describe("group smoke journey", () => {
  /**
   * React's dev-mode hydration error is a known, pre-existing mismatch in this
   * app — it is the reason `e2e/smoke.spec.ts` is red on a clean checkout of
   * `main`. It reaches us as an uncaught "There was an error while hydrating…"
   * and says nothing about this journey, so it is dropped at the listener
   * rather than at the assertion: everything else stays a hard gate.
   */
  const isHydrationNoise = (message: string) => /hydrat/i.test(message);

  function watchForErrors(page: Page) {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      if (!isHydrationNoise(error.message)) errors.push(error.message);
    });
    return errors;
  }

  test("creates a group, invites a member, and splits an expense between them", async ({
    page,
    browser,
  }) => {
    const api = new FakeMergePayApi();
    await mountJourney(page, api, ALICE);

    const errors = watchForErrors(page);

    // ── 1. Create the group ────────────────────────────────────────────────
    await signIn(page);
    await page.locator("aside").getByRole("link", { name: "Groups" }).click();
    await expect(
      page.getByRole("heading", { name: /your groups/i })
    ).toBeVisible();
    await expect(page.getByText(/no groups yet/i)).toBeVisible();

    await page.getByRole("button", { name: /new group/i }).click();
    const createDialog = page.getByRole("dialog", { name: /new group/i });
    await createDialog.getByLabel(/group name/i).fill(GROUP_NAME);
    await createDialog.getByLabel(/description/i).fill("Smoke test circle");

    const [createdGroup] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/groups") &&
          response.request().method() === "POST"
      ),
      createDialog.getByRole("button", { name: /create group/i }).click(),
    ]);

    expect(createdGroup.status()).toBe(201);
    const { group: groupBody } = (await createdGroup.json()) as {
      group: { id: string; name: string };
    };
    // The name the admin typed is the name the server stored.
    expect(groupBody.name).toBe(GROUP_NAME);
    const groupId = groupBody.id;

    // The dialog closes and hands the browser to the new group. The list
    // filters keep `pageSize` in the query string, so the id is a prefix of
    // the path rather than the whole URL.
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}(\\?[^#]*)?$`));
    await expect(
      page.getByRole("heading", { name: GROUP_NAME })
    ).toBeVisible();
    await expect(page.getByText(/no expenses yet/i)).toBeVisible();

    // ── 2. Invite a member ─────────────────────────────────────────────────
    await page.getByRole("button", { name: /^invite$/i }).click();
    const inviteDialog = page.getByRole("dialog", { name: /invite to/i });
    await inviteDialog.getByLabel(/max uses/i).fill("1");

    const [issuedInvite] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/api/groups/${groupId}/invite`) &&
          response.request().method() === "POST"
      ),
      inviteDialog.getByRole("button", { name: /generate invite/i }).click(),
    ]);

    expect(issuedInvite.status()).toBe(201);
    const { invite } = (await issuedInvite.json()) as {
      invite: { code: string };
    };

    // The modal shows a shareable link built from the invite it was issued.
    // The detail route writes its own query params, so only the path is pinned.
    await expect(inviteDialog.getByLabel(/share link/i)).toHaveValue(
      new RegExp(`/join/${invite.code}(\\?|$)`)
    );
    await inviteDialog.getByRole("button", { name: /^done$/i }).click();
    await expect(inviteDialog).toBeHidden();

    // ── 3. The invited person redeems it, in their own browser ─────────────
    const visitor = await browser.newContext();
    const visitorPage = await visitor.newPage();
    const visitorErrors = watchForErrors(visitorPage);
    await mountJourney(visitorPage, api, BOB);

    await visitorPage.goto(`/join/${invite.code}`);
    // An invitee arrives cold, with no session — which is what following a
    // shared link actually means. The `/join` page parks the code in
    // `mergepay.pendingInvite` and sends the visitor to `/login` by itself, and
    // signing in hands them straight back to the link they were given. Waiting
    // for that redirect is the step that matters: navigating to `/login` early
    // would abandon the park and land Bob on a dashboard he never asked for.
    await expect(visitorPage).toHaveURL(/\/login$/);
    await connectWallet(visitorPage);
    await expect(visitorPage).toHaveURL(new RegExp(`/join/${invite.code}$`));
    await expect(
      visitorPage.getByRole("heading", { name: /^join group$/i })
    ).toBeVisible();
    // The invite is presented with what it is still worth, before it is spent.
    await expect(visitorPage.getByText(/1 of 1/i)).toBeVisible();

    const [joined] = await Promise.all([
      visitorPage.waitForResponse(
        (response) =>
          response.url().endsWith("/api/groups/join") &&
          response.request().method() === "POST"
      ),
      visitorPage.getByRole("button", { name: /^join group$/i }).click(),
    ]);
    expect(joined.status()).toBe(200);

    // Redeeming lands the visitor inside the group they were invited to.
    await visitorPage.waitForURL(new RegExp(`/groups/${groupId}(\\?[^#]*)?$`));
    await expect(
      visitorPage.getByRole("heading", { name: GROUP_NAME })
    ).toBeVisible();
    await visitor.close();

    // ── 4. The group now has two members ───────────────────────────────────
    // Alice comes back to the app instead of carrying on in the tab she opened
    // before the invite was redeemed. A new document is the only way her query
    // cache starts over: inside one session the 30s `staleTime` legitimately
    // serves her the member list as it looked before Bob joined, and a test
    // that waited it out would be asserting on a timer.
    await signIn(page);
    await page.locator("aside").getByRole("link", { name: "Groups" }).click();
    await expect(page.getByText(/2 members/i)).toBeVisible();

    // ── 5. One expense, split across both of them ──────────────────────────
    await page
      .getByRole("link", { name: new RegExp(GROUP_NAME) })
      .first()
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/groups/${groupId}(\\?[^#]*)?$`)
    );
    await page.getByRole("button", { name: /add expense/i }).click();
    const expenseDialog = page.getByRole("dialog", { name: /add expense/i });
    await expenseDialog.getByLabel(/^title$/i).fill(EXPENSE_TITLE);
    await expenseDialog.getByLabel(/^amount$/i).fill(EXPENSE_AMOUNT);

    const [postedExpense] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/api/groups/${groupId}/expenses`) &&
          response.request().method() === "POST"
      ),
      expenseDialog.getByRole("button", { name: /^add expense$/i }).click(),
    ]);

    expect(postedExpense.status()).toBe(201);
    const { expense } = (await postedExpense.json()) as {
      expense: {
        title: string;
        amount: string;
        shares: { userId: string; shareAmount: string; status: string }[];
      };
    };

    // The dialog's member list became the split: both participants, half each.
    expect(expense.title).toBe(EXPENSE_TITLE);
    expect(expense.amount).toBe(EXPENSE_AMOUNT);
    expect(expense.shares.map((share) => share.shareAmount)).toEqual([
      EACH_SHARE,
      EACH_SHARE,
    ]);
    // The invitee is a participant, which is only possible if step 3 worked.
    expect(
      expense.shares.find((share) => share.userId === ALICE.id)?.status
    ).toBe("settled");
    expect(
      expense.shares.find((share) => share.userId === BOB.id)?.status
    ).toBe("pending");

    await expect(expenseDialog).toBeHidden();
    await expect(
      page.getByText(/expense added successfully/i).first()
    ).toBeVisible();

    // ── 6. Both sides of the ledger agree ──────────────────────────────────
    await expect(
      page.getByRole("heading", { name: /expenses \(1\)/i })
    ).toBeVisible();
    await expect(page.getByText(EXPENSE_TITLE).first()).toBeVisible();
    await expect(page.getByText(TOTAL_SHOWN).first()).toBeVisible();

    await page
      .getByRole("button", {
        name: new RegExp(`expand expense ${EXPENSE_TITLE}`, "i"),
      })
      .click();
    await expect(page.getByText(/shares · 1\/2 settled/i)).toBeVisible();
    // The invitee shows up as one of the two shares, not just as a member.
    await expect(
      page.getByText(BOB.displayName).filter({ visible: true }).first()
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Net balances", exact: true })
    ).toBeVisible();
    // One number, two signs: what Alice is owed is exactly what Bob owes.
    await expect(page.getByText(`+${EACH_SHARE_SHOWN}`).first()).toBeVisible();
    await expect(page.getByText(`-${EACH_SHARE_SHOWN}`).first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /simplified settlement paths/i })
    ).toBeVisible();

    // ── 7. Nothing along the way threw ─────────────────────────────────────
    expect(
      errors.filter((message) => !/hydration failed/i.test(message)),
      `uncaught errors:\n${errors.join("\n")}`
    ).toEqual([]);
    expect(
      api.unexpected,
      `unhandled API calls:\n${api.unexpected.join("\n")}`
    ).toEqual([]);
  });
});
