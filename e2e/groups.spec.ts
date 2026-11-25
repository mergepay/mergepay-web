import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * End-to-end coverage for group creation and member invitation (#712).
 *
 * The journey this spec protects is the first one a new admin walks:
 *
 *   sign in with Freighter → create a group → see its detail page →
 *   generate an invite link/code → hand that code to another member.
 *
 * Two substitutions make it runnable in CI, where neither dependency of the
 * real app exists:
 *
 *   1. **The wallet.** There is no extension to talk to, so
 *      {@link mockFreighter} answers the `window.postMessage` protocol
 *      `@stellar/freighter-api` speaks. That lets the app run its real
 *      connect → challenge → sign → verify flow rather than seeding a
 *      session, which is what proves the invite screens sit behind an honest
 *      login.
 *
 *   2. **The backend.** `/api/*` calls are served from a small stateful fake:
 *      a created group is what the follow-up detail request reads, and an
 *      issued invite is what the join dialog resolves. Static fixtures would
 *      let a broken hand-off between those steps pass unnoticed.
 *
 * Nothing here waits on `networkidle`: the app polls health, activity and the
 * wallet forever, so it never goes idle. Every wait names the locator or the
 * response it is actually for.
 */

// First compile of a route under `next dev` is not instant, and this spec
// covers four routes plus the invite round trip.
test.describe.configure({ timeout: 120_000 });

// ---------------------------------------------------------------------------
// The network and the people the fake has to agree with the app about
// ---------------------------------------------------------------------------

/**
 * Mirrors `normalizeNetwork` in `src/lib/explorer.ts`. The wallet must report
 * the network this build targets or `assertWalletNetwork` refuses the login.
 * CI exports `NEXT_PUBLIC_STELLAR_NETWORK=testnet` only on its build step,
 * while a plain `npm run dev` defaults to mainnet; the Playwright web server
 * inherits this process's environment, so reading the same variable keeps the
 * mock and the app in step.
 */
const NETWORK_ALIASES: Record<string, "public" | "testnet"> = {
  public: "public",
  pubnet: "public",
  mainnet: "public",
  testnet: "testnet",
  test: "testnet",
};

const NETWORK: "public" | "testnet" =
  NETWORK_ALIASES[
    (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "").trim().toLowerCase()
  ] ?? "public";

const NETWORK_PASSPHRASE =
  NETWORK === "testnet"
    ? "Test SDF Network ; September 2015"
    : "Public Global Stellar Network ; September 2015";

const HORIZON_URL =
  NETWORK === "testnet"
    ? "https://horizon-testnet.stellar.org"
    : "https://horizon.stellar.org";

interface FakeUser {
  id: string;
  stellarPublicKey: string;
  displayName: string;
  avatarUrl: null;
  createdAt: string;
}

/** The signed-in admin. The detail page hardcodes `user-1` as its current user. */
const ALICE: FakeUser = {
  id: "user-1",
  stellarPublicKey: "GABXOT2RNLXHLFE5B7CCAVJ3Z567K3TALIA3567DI2XAXVBGWHXC2CVF",
  displayName: "Alice Stellar",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** The member Alice invites, and the owner of the group the join dialog finds. */
const BOB: FakeUser = {
  id: "user-2",
  stellarPublicKey: "GB7ETITECXAE47D6BSHV6IH5V4MAPVPWOF7KJEEFBCVGWHFWCAZW22MQ",
  displayName: "Bob Testnet",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const NOW = "2026-02-01T09:00:00.000Z";

/** Group the join-dialog test redeems an invite into. Owned by Bob, not Alice. */
const SEEDED_GROUP_ID = "grp-seeded-1";
const SEEDED_GROUP_NAME = "Bookkeeping club";
const SEEDED_INVITE_CODE = "test-code";

// ---------------------------------------------------------------------------
// Stateful fake API
// ---------------------------------------------------------------------------

interface MemberRecord {
  userId: string;
  role: "admin" | "member" | "viewer";
  joinedAt: string;
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
  inviteCodes: string[];
}

/**
 * Mint a bearer token the app's own expiry watcher accepts.
 *
 * `useTokenExpiry` reads the `exp` claim and signs the user out as it passes,
 * so an opaque string would end the session on a timer instead of at the end
 * of the journey.
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
 * A minimal, in-process MergePay API: groups, invites, membership and the
 * empty expense/balance reads the detail page makes. Only the endpoints this
 * journey touches are implemented; anything else is recorded in `unexpected`
 * and answered 404, so a UI change that starts calling a new endpoint shows
 * up as a named failure instead of a silent pass.
 */
class FakeMergePayApi {
  private readonly groups = new Map<string, GroupRecord>();
  private readonly invites = new Map<string, InviteRecord>();
  private sequence = 0;

  /** Bodies of `POST /api/groups`, as the app sent them. */
  readonly createRequests: Record<string, unknown>[] = [];
  /** Bodies of `POST /api/groups/:id/invite`, with the group they targeted. */
  readonly inviteRequests: { groupId: string; body: Record<string, unknown> }[] =
    [];
  /** Codes posted to `POST /api/groups/join`. */
  readonly joinRequests: string[] = [];
  /** Requests the fake had no handler for. */
  readonly unexpected: string[] = [];

  constructor() {
    // A group Alice is *not* in, with a live invite she can redeem from the
    // join dialog. It is absent from her group list until she joins.
    const group: GroupRecord = {
      id: SEEDED_GROUP_ID,
      name: SEEDED_GROUP_NAME,
      description: "A circle Alice has been invited to",
      createdByUserId: BOB.id,
      treasuryEnabled: false,
      treasuryAccountPublicKey: null,
      treasuryRequiredSigners: null,
      archived: false,
      createdAt: NOW,
      members: [{ userId: BOB.id, role: "admin", joinedAt: NOW }],
      inviteCodes: [SEEDED_INVITE_CODE],
    };
    this.groups.set(group.id, group);
    this.invites.set(SEEDED_INVITE_CODE, {
      id: "inv-seeded-1",
      groupId: group.id,
      code: SEEDED_INVITE_CODE,
      url: `http://localhost:3000/join/${SEEDED_INVITE_CODE}?group=${group.id}`,
      expiresAt: null,
      // Two uses: the dialog renders "2 of 2 uses remaining" before redeeming.
      maxUses: 2,
      uses: 0,
      createdAt: NOW,
    });
  }

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

    // The app pings its own health route on an interval and treats a non-2xx
    // as "API degraded".
    if (path === "/api/health") {
      return this.json(route, 200, {
        status: "ok",
        uptime: 1,
        timestamp: new Date().toISOString(),
        dependencies: { api: "ok", stellar: "ok" },
      });
    }

    // Session — the guard resolves these before any group data.
    if (path === "/api/me") return this.json(route, 200, { user: actor });
    if (path === "/api/auth/challenge") {
      // This fake is also the verifier, so the envelope handed back to be
      // signed only has to be opaque.
      return this.json(route, 200, {
        transaction: "e2e-sep10-challenge-xdr",
        networkPassphrase: NETWORK_PASSPHRASE,
      });
    }
    if (path === "/api/auth/verify" || path === "/api/auth/refresh") {
      return this.json(route, 200, {
        token: sessionToken(actor.id),
        user: actor,
      });
    }
    if (path === "/api/auth/logout") return this.json(route, 200, { ok: true });

    // The dashboard holds the SEP-24 modal mounted, and that hook reads the
    // anchor catalogue as soon as it mounts — open or not.
    if (path === "/api/anchors") return this.json(route, 200, { anchors: [] });

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
        return this.json(route, 200, { expenses: [] });
      }
      if (section === "balances") {
        return this.json(route, 200, {
          balances: group.members.map((member) => ({
            userId: member.userId,
            user: this.userById(member.userId),
            net: "0.0000000",
            assetCode: "XLM",
          })),
          suggestions: [],
        });
      }
      if (section === "ledger") {
        return this.json(route, 200, { entries: [], nextCursor: null });
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
    // (CoinGecko prices) land here too. They are not this API's contract: a
    // 404 is the app's documented "fall back to the indicative rate" path, so
    // it is answered quietly instead of counted as a gap in the fake.
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
    return `${prefix}-groups-${this.sequence}`;
  }

  private userById(id: string): FakeUser {
    return [ALICE, BOB].find((user) => user.id === id) ?? ALICE;
  }

  // -- groups ---------------------------------------------------------------

  private createGroup(
    route: Route,
    actor: FakeUser,
    body: Record<string, unknown>
  ): Promise<void> {
    this.createRequests.push(body);

    const group: GroupRecord = {
      id: this.nextId("grp"),
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
      inviteCodes: [],
    };
    this.groups.set(group.id, group);
    return this.json(route, 201, { group });
  }

  private listGroups(actor: FakeUser) {
    return [...this.groups.values()]
      .filter((group) =>
        group.members.some((member) => member.userId === actor.id)
      )
      .map((group) => ({
        ...group,
        memberCount: group.members.length,
        yourNet: "0.0000000",
        netAssetCode: "XLM",
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
    this.inviteRequests.push({ groupId: group.id, body });

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
    this.joinRequests.push(code);

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
}

// ---------------------------------------------------------------------------
// Browser fixtures
// ---------------------------------------------------------------------------

/**
 * Stand in for the Freighter extension.
 *
 * The response echoes the request's `messageId` under the key **`messagedId`**
 * — that misspelling is what v4.1.0's listener compares, so "fixing" it leaves
 * every wallet call hanging until its timeout. `REQUEST_PUBLIC_KEY` and
 * `REQUEST_NETWORK_DETAILS` must keep answering for the life of the page,
 * because `WatchWalletChanges` polls both after login and treats an error as
 * "the wallet disconnected".
 */
async function mockFreighter(page: Page): Promise<void> {
  await page.addInitScript(
    ({ publicKey, network, networkPassphrase, networkUrl }) => {
      // `isConnected()` checks this global before sending any message.
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
        const reply = (payload: Record<string, unknown>) =>
          window.postMessage(
            {
              source: "FREIGHTER_EXTERNAL_MSG_RESPONSE",
              messagedId: messageId,
              ...payload,
            },
            "*"
          );

        switch (type) {
          case "REQUEST_CONNECTION_STATUS":
            return reply({ isConnected: true });
          case "REQUEST_ALLOWED":
          case "REQUEST_ALLOWED_STATUS":
          case "SET_ALLOWED_STATUS":
            return reply({ isAllowed: true });
          case "REQUEST_ACCESS":
          case "REQUEST_PUBLIC_KEY":
            return reply({ publicKey });
          case "REQUEST_NETWORK":
            return reply({ network });
          case "REQUEST_NETWORK_DETAILS":
            return reply({
              networkDetails: {
                network,
                networkName: network === "TESTNET" ? "Testnet" : "Public",
                networkUrl,
                networkPassphrase,
                sorobanRpcUrl: null,
              },
            });
          case "SUBMIT_TRANSACTION":
            // The signature is never inspected: the fake API above is the
            // verifier, and what is under test is that the app asks the
            // wallet to sign the challenge it was handed.
            return reply({
              signedTransaction: String(data.transactionXdr ?? ""),
              signerAddress: publicKey,
            });
          default:
            return reply({
              apiError: {
                code: -1,
                message: `Unhandled Freighter request in e2e: ${String(type)}`,
              },
            });
        }
      });
    },
    {
      publicKey: ALICE.stellarPublicKey,
      network: NETWORK.toUpperCase(),
      networkPassphrase: NETWORK_PASSPHRASE,
      networkUrl: HORIZON_URL,
    }
  );
}

/**
 * Answer Horizon so the trustline banner resolves offline.
 *
 * The banner reads the connected account's balances on mount. Left alone it
 * would call the real network for a key that belongs to nobody, making the
 * journey depend on a public RPC being up.
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
          ],
        }),
      })
  );
}

/** Put one context's user behind the shared fake. */
async function mountJourney(
  page: Page,
  api: FakeMergePayApi,
  user: FakeUser = ALICE
): Promise<void> {
  await mockFreighter(page);
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

/**
 * How long to allow a navigation that may be waiting on `next dev`'s first
 * compile of a route. CI runs one worker, but a local run starts four in
 * parallel and the default five-second assertion is not a fair budget for a
 * cold compile on that machine.
 */
const NAV_TIMEOUT = 30_000;

/** Drive the real connect → challenge → sign → verify login, not a shortcut. */
async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-connect").click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: NAV_TIMEOUT });
}

/**
 * Sign in and reach `/groups` by clicking.
 *
 * Client-side navigation only: the bearer token lives in memory (#543), so a
 * full page load would land back on the sign-in screen.
 */
async function openGroupsPage(page: Page): Promise<void> {
  await signIn(page);
  await page.locator("aside").getByRole("link", { name: "Groups" }).click();
  await expect(page).toHaveURL(/\/groups$/, { timeout: NAV_TIMEOUT });
  await expect(
    page.getByRole("heading", { name: /your groups/i })
  ).toBeVisible();
}

/**
 * Create a group through the dialog and return the id the fake assigned.
 *
 * Waiting on the POST response (rather than on the URL) is what lets the
 * caller assert on the body the app actually sent.
 */
async function createGroup(
  page: Page,
  fields: { name: string; description?: string }
): Promise<string> {
  await page.getByTestId("groups-create").click();
  const dialog = page.getByRole("dialog", { name: "New group" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Group name").fill(fields.name);
  if (fields.description) {
    await dialog.getByLabel("Description (optional)").fill(fields.description);
  }

  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/groups") &&
        res.request().method() === "POST"
    ),
    dialog.getByRole("button", { name: /create group/i }).click(),
  ]);
  expect(response.status()).toBe(201);

  const { group } = (await response.json()) as {
    group: { id: string; name: string };
  };
  // The dialog closes and hands the browser to the new group.
  await expect(page).toHaveURL(
    new RegExp(`/groups/${group.id}(\\?[^#]*)?$`),
    { timeout: NAV_TIMEOUT }
  );
  return group.id;
}

/**
 * Collects uncaught exceptions on `page`.
 *
 * React's dev-mode hydration error is a known, pre-existing mismatch in this
 * app (see the sibling specs); it says nothing about this journey and would
 * fail every run. Everything else stays a hard gate.
 */
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (/hydrat/i.test(error.message)) return;
    errors.push(error.message);
  });
  return errors;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("group creation and member invitation", () => {
  test("creates a group and lands on its detail page", async ({ page }) => {
    const api = new FakeMergePayApi();
    const pageErrors = trackPageErrors(page);
    await mountJourney(page, api);

    await openGroupsPage(page);
    // Alice has not joined the seeded group, so her list starts empty.
    await expect(page.getByTestId("group-card")).toHaveCount(0);

    const groupId = await createGroup(page, {
      name: "Lagos roadtrip",
      description: "Fuel and stays",
    });

    await expect(page.getByTestId("group-title")).toHaveText("Lagos roadtrip");

    // The wire body is the part a rendered heading cannot prove: the name and
    // description the admin typed are what reached the API.
    expect(api.createRequests).toHaveLength(1);
    expect(api.createRequests[0]).toEqual({
      name: "Lagos roadtrip",
      description: "Fuel and stays",
    });

    // The new group is now in the list, with the creator as its only member.
    await page.locator("aside").getByRole("link", { name: "Groups" }).click();
    const card = page.locator(
      `[data-testid="group-card"][data-group-id="${groupId}"]`
    );
    await expect(card).toBeVisible();
    await expect(card).toContainText("Lagos roadtrip");
    await expect(card).toContainText("1 member");

    expect(api.unexpected, `unhandled API calls: ${api.unexpected.join(", ")}`).toEqual(
      []
    );
    expect(pageErrors, `uncaught errors:\n${pageErrors.join("\n")}`).toEqual([]);
  });

  test("validates the group name inline and blocks invalid submissions", async ({
    page,
  }) => {
    const api = new FakeMergePayApi();
    await mountJourney(page, api);
    await openGroupsPage(page);

    await page.getByTestId("groups-create").click();
    const dialog = page.getByRole("dialog", { name: "New group" });
    const name = dialog.getByLabel("Group name");
    const submit = dialog.getByRole("button", { name: /create group/i });

    // A one-character name is rejected on blur, before the user submits.
    await name.fill("A");
    await name.blur();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.locator("#g-name-error")).toHaveText(
      "Group name must be at least 2 characters"
    );

    // Correcting the field clears the inline error without a round trip.
    await name.fill("Flat 3B");
    await name.blur();
    await expect(name).not.toHaveAttribute("aria-invalid");
    await expect(dialog.locator("#g-name-error")).toHaveCount(0);

    // Empty and whitespace-only names are caught again on submit, and neither
    // is allowed to reach the API.
    await name.fill("");
    await submit.click();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.locator("#g-name-error")).toHaveText(
      "Group name must be at least 2 characters"
    );

    await name.fill("   ");
    await submit.click();
    await expect(dialog.locator("#g-name-error")).toHaveText(
      "Group name must be at least 2 characters"
    );

    // The dialog stays open and no group was created.
    await expect(dialog).toBeVisible();
    expect(api.createRequests).toHaveLength(0);
  });

  test("generates an invite link and code with usage limits", async ({
    page,
  }) => {
    const api = new FakeMergePayApi();
    await mountJourney(page, api);
    await openGroupsPage(page);
    const groupId = await createGroup(page, { name: "Weekend plans" });

    await page.getByRole("button", { name: /^invite$/i }).click();
    const dialog = page.getByRole("dialog", {
      name: /invite to weekend plans/i,
    });
    await expect(dialog).toBeVisible();

    // The admin can bound the invite before generating it.
    await dialog.getByLabel("Max uses").fill("1");
    await dialog.getByLabel("Expires in (hours)").fill("24");

    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/api/groups/${groupId}/invite`) &&
          res.request().method() === "POST"
      ),
      dialog.getByRole("button", { name: /generate invite/i }).click(),
    ]);
    expect(response.status()).toBe(201);

    const { invite } = (await response.json()) as {
      invite: { code: string; url: string };
    };

    // The limits the admin set are the ones that crossed the wire.
    expect(api.inviteRequests).toHaveLength(1);
    expect(api.inviteRequests[0]).toEqual({
      groupId,
      body: { maxUses: 1, expiresInHours: 24 },
    });

    // The modal shows the issued code and a same-origin deep link that
    // carries both the token and the group id.
    await expect(dialog.getByText(invite.code, { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Share link")).toHaveValue(
      new RegExp(`/join/${invite.code}\\?group=${groupId}$`)
    );
    await expect(dialog.getByRole("button", { name: /copy invite link/i })).toBeVisible();

    // And it restates the limits that will apply when somebody redeems it.
    await expect(dialog.getByText("1 uses max")).toBeVisible();
    await expect(dialog.getByText(/expires/i)).toBeVisible();

    // Closing the dialog releases it; the group remains the only one listed.
    await dialog.getByRole("button", { name: /^done$/i }).click();
    await expect(dialog).toBeHidden();
  });

  test("accepts a member invite address/code after validating it", async ({
    page,
  }) => {
    const api = new FakeMergePayApi();
    await mountJourney(page, api);
    await openGroupsPage(page);

    await page.getByRole("button", { name: /^join group$/i }).first().click();
    const dialog = page.getByRole("dialog", { name: /join a group/i });
    await expect(dialog).toBeVisible();

    const code = dialog.getByLabel(/invite code/i);
    const submit = dialog.getByRole("button", { name: /^join group$/i });

    // A malformed code is rejected locally: no membership request is issued.
    await code.fill("ab");
    await submit.click();
    await expect(dialog.getByRole("alert")).toContainText(
      /too short to be valid/i
    );
    expect(api.joinRequests).toHaveLength(0);

    // A well-formed code resolves its invite details before the member joins.
    const [inviteResponse] = await Promise.all([
      page.waitForResponse((res) =>
        res.url().endsWith(`/api/invites/${SEEDED_INVITE_CODE}`)
      ),
      code.fill(SEEDED_INVITE_CODE),
    ]);
    expect(inviteResponse.status()).toBe(200);

    await expect(dialog.getByText(`Group: ${SEEDED_GROUP_ID}`)).toBeVisible();
    await expect(dialog.getByText(/2 of 2 uses remaining/i)).toBeVisible();

    const [joinResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().endsWith("/api/groups/join") &&
          res.request().method() === "POST"
      ),
      submit.click(),
    ]);
    expect(joinResponse.status()).toBe(200);

    // The code the member typed is the code that was redeemed, and they land
    // inside the group the invite points at.
    expect(api.joinRequests).toEqual([SEEDED_INVITE_CODE]);
    await page.waitForURL(
      new RegExp(`/groups/${SEEDED_GROUP_ID}(\\?[^#]*)?$`),
      { timeout: NAV_TIMEOUT }
    );
    await expect(page.getByTestId("group-title")).toHaveText(
      SEEDED_GROUP_NAME
    );

    // The membership is real: the group is now in Alice's list.
    await page.locator("aside").getByRole("link", { name: "Groups" }).click();
    await expect(
      page.locator(
        `[data-testid="group-card"][data-group-id="${SEEDED_GROUP_ID}"]`
      )
    ).toContainText("2 members");
  });
});
