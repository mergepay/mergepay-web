import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * End-to-end coverage for the wallet connection and group creation flow
 * (#620).
 *
 * Verifies the complete journey from first landing to a created group with an
 * expense recorded:
 *
 *   1. Landing page renders, header links work, protected routes redirect.
 *   2. Freighter wallet mock is injected via the postMessage protocol.
 *   3. Full SEP-10 sign-in flow runs end-to-end (challenge → sign → verify).
 *   4. Dashboard and Groups navigation work after login.
 *   5. A group can be created through the dialog.
 *   6. An expense can be added to the group with valid inputs.
 *   7. The submit button is disabled while the form is invalid (Zod guard).
 *
 * Both infrastructure substitutions from the sibling specs are used here:
 *
 * - **Freighter mock** — `installFreighter` answers the `window.postMessage`
 *   protocol that `@stellar/freighter-api` speaks, so the real SEP-10 flow
 *   runs without a browser extension.
 *
 * - **Fake API** — `installFakeApi` intercepts every `/api/**` call and
 *   serves in-memory responses shaped to the Zod schemas in
 *   `src/lib/schemas.ts`, which the client validates at runtime.
 */

// First compile of a cold route can be slow; give the browser plenty of time.
test.describe.configure({ timeout: 120_000 });

/**
 * Warm the two public routes these tests hit most: `/` and `/login`.
 * `next dev` compiles on demand; the first request for a route with a heavy
 * import graph (login imports @stellar/stellar-sdk) can take several seconds
 * and occasionally times out on a cold runner. Fetching both here, before any
 * test browser opens, means all 16 tests land on compiled pages.
 */
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto("/", { timeout: 90_000, waitUntil: "domcontentloaded" });
    await page.goto("/login", { timeout: 90_000, waitUntil: "domcontentloaded" });
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// Network / wallet constants — must agree with the running dev server
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Network / wallet constants — must agree with the running dev server
// ---------------------------------------------------------------------------

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

// Real Stellar public keys: valid ed25519 strkeys that the app can decode.
const ALICE_KEY =
  "GBLI7JERBEGKK3DLZNR7B2TNGDNNUMX5X5R5JCS3TODZNCKJA7W6KG7M";
const BOB_KEY =
  "GCEW4M2WOHOJ4IJA76QVSHEPG7W5VEZFE7KQKZ3IV4TQZH2YC4ARO4YC";

const ALICE = {
  id: "user-alice",
  stellarPublicKey: ALICE_KEY,
  displayName: "Alice",
  avatarUrl: null as string | null,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const BOB = {
  id: "user-bob",
  stellarPublicKey: BOB_KEY,
  displayName: "Bob",
  avatarUrl: null as string | null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Freighter mock — mirrors the postMessage protocol @stellar/freighter-api uses
// ---------------------------------------------------------------------------

/**
 * Inject a mock Freighter extension into the page via `addInitScript`.
 *
 * Critical details:
 * - The response key is `messagedId` (misspelling matches freighter-api v4.1.0)
 * - `REQUEST_PUBLIC_KEY` and `REQUEST_NETWORK_DETAILS` must keep answering for
 *   the entire page lifetime; `WatchWalletChanges` polls them every 2 s and
 *   treats silence as "wallet disconnected".
 */
async function installFreighter(page: Page): Promise<void> {
  type WalletArgs = [
    publicKey: string,
    network: string,
    networkName: string,
    networkUrl: string,
    networkPassphrase: string,
  ];

  const wallet: WalletArgs = [
    ALICE_KEY,
    NETWORK,
    NETWORK === "testnet" ? "TESTNET" : "PUBLIC",
    NETWORK === "testnet"
      ? "https://horizon-testnet.stellar.org"
      : "https://horizon.stellar.org",
    NETWORK_PASSPHRASE,
  ];

  await page.addInitScript(
    ([publicKey, network, networkName, networkUrl, networkPassphrase]: WalletArgs) => {
      window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const req = event.data as Record<string, unknown> | null;
        if (req?.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST") return;

        const reply = (payload: Record<string, unknown>) =>
          window.postMessage(
            {
              source: "FREIGHTER_EXTERNAL_MSG_RESPONSE",
              // intentional misspelling — matches freighter-api v4.1.0 listener
              messagedId: req.messageId,
              ...payload,
            },
            window.location.origin
          );

        switch (req.type) {
          case "REQUEST_CONNECTION_STATUS":
            return reply({ isConnected: true });
          case "REQUEST_ALLOWED_STATUS":
          case "SET_ALLOWED_STATUS":
            return reply({ isAllowed: true });
          case "REQUEST_ACCESS":
          case "REQUEST_PUBLIC_KEY":
            return reply({ publicKey });
          case "REQUEST_NETWORK":
          case "REQUEST_NETWORK_DETAILS":
            return reply({
              networkDetails: {
                network,
                networkName,
                networkUrl,
                networkPassphrase,
              },
            });
          case "SUBMIT_TRANSACTION":
            // Echo back the XDR — the fake API verifier accepts any signed blob
            return reply({
              signedTransaction: req.transactionXdr,
              signerAddress: publicKey,
            });
          default:
            return reply({
              apiError: {
                code: -1,
                message: `Unhandled Freighter message type: ${String(req.type)}`,
              },
            });
        }
      });
    },
    wallet
  );
}

// ---------------------------------------------------------------------------
// Fake API — in-memory backend that passes Zod schema validation
// ---------------------------------------------------------------------------

const STROOPS = 10_000_000n;

function toStroops(value: string): bigint {
  const [whole, fraction = ""] = value.replace("+", "").split(".");
  return (
    BigInt(whole || "0") * STROOPS +
    BigInt(fraction.padEnd(7, "0").slice(0, 7))
  );
}

function fromStroops(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const fraction = (abs % STROOPS)
    .toString()
    .padStart(7, "0")
    .replace(/0+$/, "");
  return `${sign}${abs / STROOPS}${fraction ? `.${fraction}` : ""}`;
}

/** A JWT-shaped token the app's expiry watcher accepts. */
function sessionToken(): string {
  const b64 = (v: object) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    sub: ALICE.id,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.e2e-sig`;
}

interface FakeGroup {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  memberUserIds: string[];
  expenses: FakeExpense[];
}

interface FakeExpense {
  id: string;
  groupId: string;
  payerUserId: string;
  title: string;
  description: string | null;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
  memo: string | null;
  createdAt: string;
  shares: { userId: string; shareAmount: string }[];
}

function userDto(user: typeof ALICE | typeof BOB) {
  return {
    id: user.id,
    stellarPublicKey: user.stellarPublicKey,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}

async function installFakeApi(page: Page): Promise<void> {
  const groups: FakeGroup[] = [];
  let groupSeq = 1;
  let expenseSeq = 1;

  const splitEqually = (total: bigint, userIds: string[]): bigint[] => {
    const size = BigInt(userIds.length);
    const base = total / size;
    const rem = total % size;
    return userIds.map((_, i) => (BigInt(i) < rem ? base + 1n : base));
  };

  const groupDto = (g: FakeGroup) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    createdByUserId: ALICE.id,
    treasuryEnabled: false,
    treasuryAccountPublicKey: null,
    treasuryRequiredSigners: null,
    archived: false,
    createdAt: g.createdAt,
  });

  const expenseDto = (e: FakeExpense) => ({
    id: e.id,
    groupId: e.groupId,
    payerUserId: e.payerUserId,
    payer: userDto(ALICE),
    title: e.title,
    description: e.description,
    amount: e.amount,
    assetCode: e.assetCode,
    assetIssuer: e.assetIssuer,
    splitType: "equal",
    memo: e.memo,
    receiptUrl: null,
    createdAt: e.createdAt,
    shares: e.shares.map((s) => ({
      id: `${e.id}-${s.userId}`,
      expenseId: e.id,
      userId: s.userId,
      user: s.userId === ALICE.id ? userDto(ALICE) : userDto(BOB),
      shareAmount: s.shareAmount,
      status: "pending",
    })),
  });

  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const path = new URL(req.url()).pathname.replace(/\/$/, "");
    const send = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    // Health / misc
    if (path === "/api/health") return send({ status: "ok" });
    if (path === "/api/anchors") return send({ anchors: [] });
    if (path === "/api/me" && method === "GET")
      return send({ user: userDto(ALICE) });

    // SEP-10
    if (path === "/api/auth/challenge" && method === "POST") {
      return send({
        transaction: "e2e-challenge-xdr",
        networkPassphrase: NETWORK_PASSPHRASE,
      });
    }
    if (path === "/api/auth/verify" && method === "POST") {
      const body = (await req.postDataJSON()) as { transaction?: string };
      if (!body.transaction) return send({ error: "no signature" }, 401);
      return send({ token: sessionToken(), user: userDto(ALICE) });
    }
    if (path === "/api/auth/logout" && method === "POST")
      return send({ ok: true });

    // Groups list
    if (path === "/api/groups") {
      if (method === "POST") {
        const body = (await req.postDataJSON()) as {
          name?: string;
          description?: string;
        };
        const g: FakeGroup = {
          id: `grp-${groupSeq++}`,
          name: String(body.name ?? "").trim() || "Untitled",
          description: body.description?.trim() || null,
          createdAt: new Date().toISOString(),
          memberUserIds: [ALICE.id, BOB.id],
          expenses: [],
        };
        groups.push(g);
        return send({ group: groupDto(g) }, 201);
      }
      return send({
        groups: groups.map((g) => ({
          ...groupDto(g),
          memberCount: g.memberUserIds.length,
          yourNet: "0",
          netAssetCode: "XLM",
        })),
      });
    }

    // Group detail routes
    const grpMatch = /^\/api\/groups\/([^/]+)(\/.*)?$/.exec(path);
    if (grpMatch) {
      const g = groups.find((gr) => gr.id === grpMatch[1]);
      if (!g) return send({ error: "not found" }, 404);
      const sub = grpMatch[2] ?? "";

      if (sub === "") {
        return send({
          group: groupDto(g),
          members: g.memberUserIds.map((uid, i) => ({
            id: `mem-${g.id}-${uid}`,
            groupId: g.id,
            userId: uid,
            role: i === 0 ? "admin" : "member",
            joinedAt: g.createdAt,
            user: userDto(uid === ALICE.id ? ALICE : BOB),
          })),
          yourRole: "admin",
        });
      }

      if (sub === "/expenses") {
        if (method !== "POST")
          return send({ expenses: g.expenses.map(expenseDto) });

        const body = (await req.postDataJSON()) as Record<string, unknown>;
        const participants = (body.shares as { userId: string }[]).map(
          (s) => s.userId
        );
        const amounts = splitEqually(
          toStroops(String(body.amount)),
          participants
        );
        const expense: FakeExpense = {
          id: `exp-${expenseSeq++}`,
          groupId: g.id,
          payerUserId: String(body.payerUserId ?? ALICE.id),
          title: String(body.title),
          description:
            typeof body.description === "string" ? body.description : null,
          amount: String(body.amount),
          assetCode: String(body.assetCode ?? "XLM"),
          assetIssuer: (body.assetIssuer as string | null) ?? null,
          memo: typeof body.memo === "string" ? body.memo : null,
          createdAt: new Date().toISOString(),
          shares: participants.map((uid, i) => ({
            userId: uid,
            shareAmount: fromStroops(amounts[i]),
          })),
        };
        g.expenses.unshift(expense);
        return send({ expense: expenseDto(expense) }, 201);
      }

      if (sub === "/balances")
        return send({ balances: [], suggestions: [] });
      if (sub === "/ledger")
        return send({ entries: [], nextCursor: null });
      if (sub === "/activity")
        return send({ activities: [] });
    }

    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: `unhandled: ${method} ${path}` }),
    });
  });
}

/** Block Horizon and CoinGecko — test accounts don't exist on any live network. */
async function refuseExternalHosts(page: Page): Promise<void> {
  await page.route(/stellar\.org|coingecko\.com/, (route) => route.abort());
}

/** Mount the full fake stack: wallet + API + network block. */
async function setUpFakeApp(page: Page): Promise<void> {
  await installFreighter(page);
  await installFakeApi(page);
  await refuseExternalHosts(page);
}

/** Run the real SEP-10 connect → challenge → sign → verify flow. */
async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-connect").click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

test.describe("landing page and unauthenticated shell", () => {
  test("renders the neobrutalist header and hero correctly", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /mergepay/i
    );
    const header = page.locator("header").first();
    await expect(header).toBeVisible();
    await expect(header).toHaveClass(/border-b-3/);
    await expect(header).toHaveClass(/border-ink/);
  });

  test("navigates from home to login and shows the connect button", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator('header a[href="/login"]').click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: /sign in/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /connect freighter/i })
    ).toBeVisible();
  });
});

test.describe("protected route guarding", () => {
  test("redirects /dashboard to login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("button", { name: /connect freighter/i })
    ).toBeVisible();
  });

  test("redirects /groups to login when unauthenticated", async ({ page }) => {
    await page.goto("/groups");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("redirects /history to login when unauthenticated", async ({ page }) => {
    await page.goto("/history");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("leaves the login page reachable without a session", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: /sign in/i })
    ).toBeVisible();
  });
});

test.describe("Freighter wallet login — SEP-10 flow", () => {
  test("completes the full connect → challenge → sign → verify journey", async ({
    page,
  }) => {
    await setUpFakeApp(page);
    await signIn(page);
    // After a successful login the guard drops and the dashboard renders.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("navigation")).toBeVisible();
  });

  test("displays the connect button on the login screen when the mock wallet is installed", async ({
    page,
  }) => {
    await setUpFakeApp(page);
    await page.goto("/login");
    // The session restore check must complete before the connect button is shown.
    // Wait for the restoring state to clear.
    await expect(
      page.getByRole("button", { name: /connect freighter/i })
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("dashboard and navigation after login", () => {
  test("shows the sidebar navigation links after sign-in", async ({ page }) => {
    await setUpFakeApp(page);
    await signIn(page);
    const sidebar = page.locator("aside");
    await expect(
      sidebar.getByRole("link", { name: /groups/i })
    ).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: /history/i })
    ).toBeVisible();
  });

  test("client-side navigation reaches /groups without dropping the session", async ({
    page,
  }) => {
    await setUpFakeApp(page);
    await signIn(page);
    await page.locator("aside").getByRole("link", { name: /groups/i }).click();
    await expect(page).toHaveURL(/\/groups$/);
    // The groups page renders — if the session dropped it would bounce to /login
    await expect(
      page.getByRole("heading", { name: /your groups/i })
    ).toBeVisible();
  });
});

test.describe("group creation", () => {
  test("creates a group through the dialog and shows it in the list", async ({
    page,
  }) => {
    await setUpFakeApp(page);
    await signIn(page);

    await page.locator("aside").getByRole("link", { name: /groups/i }).click();
    await expect(page).toHaveURL(/\/groups$/);

    // With no groups yet the empty-state create button is shown.
    await page.getByTestId("groups-create").click();

    const dialog = page.getByRole("dialog", { name: /new group/i });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/group name/i).fill("Weekend Hike");
    await dialog.getByLabel(/description/i).fill("Trails and snacks");

    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/groups") && r.request().method() === "POST"
      ),
      page.getByTestId("create-group-confirm").click(),
    ]);

    // Creating a group redirects to its detail page, so return to the list
    // before looking for it there.
    await expect(page).toHaveURL(/\/groups\/grp-\d+(?:\?.*)?$/);
    await page.locator("aside").getByRole("link", { name: /groups/i }).click();
    await expect(page).toHaveURL(/\/groups$/);

    // The new group's name must appear in the list.
    await expect(
      page.getByRole("link", { name: /weekend hike/i })
    ).toBeVisible();
  });

  test("navigates into the group detail page after creation", async ({
    page,
  }) => {
    await setUpFakeApp(page);
    await signIn(page);

    await page.locator("aside").getByRole("link", { name: /groups/i }).click();
    await page.getByTestId("groups-create").click();

    const dialog = page.getByRole("dialog", { name: /new group/i });
    await dialog.getByLabel(/group name/i).fill("Trip to Abuja");

    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/groups") && r.request().method() === "POST"
      ),
      page.getByTestId("create-group-confirm").click(),
    ]);

    // Creating a group redirects straight to its detail page.
    await expect(page).toHaveURL(/\/groups\/grp-\d+(?:\?.*)?$/);
    await expect(page.getByTestId("group-title")).toContainText(
      /trip to abuja/i
    );
  });
});

test.describe("expense creation", () => {
  /** Sign in and navigate to the add-expense dialog for a freshly created group. */
  async function openExpenseDialog(page: Page): Promise<void> {
    await signIn(page);

    await page.locator("aside").getByRole("link", { name: /groups/i }).click();
    await page.getByTestId("groups-create").click();

    const dialog = page.getByRole("dialog", { name: /new group/i });
    await dialog.getByLabel(/group name/i).fill("Camping Trip");

    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/groups") && r.request().method() === "POST"
      ),
      page.getByTestId("create-group-confirm").click(),
    ]);

    // Creating a group redirects straight to its detail page.
    await expect(page).toHaveURL(/\/groups\/grp-\d+(?:\?.*)?$/);
    await page.getByTestId("group-add-expense").click();
    await expect(
      page.getByRole("dialog", { name: /add expense/i })
    ).toBeVisible();
  }

  test("opens the add-expense dialog from the group page", async ({ page }) => {
    await setUpFakeApp(page);
    await openExpenseDialog(page);
    // The dialog is visible and the submit button is in the DOM.
    await expect(
      page.getByRole("dialog", { name: /add expense/i })
    ).toBeVisible();
    await expect(page.getByTestId("add-expense-confirm")).toBeVisible();
  });

  test("creates an expense and shows the expense card on the group page", async ({
    page,
  }) => {
    await setUpFakeApp(page);
    await openExpenseDialog(page);

    const expenseDialog = page.getByRole("dialog", { name: /add expense/i });
    await expenseDialog.getByLabel(/^title$/i).fill("Tent rental");
    await expenseDialog.getByLabel(/^amount$/i).fill("60");

    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/expenses") && r.request().method() === "POST"
      ),
      page.getByTestId("add-expense-confirm").click(),
    ]);

    // After successful creation the dialog closes.
    await expect(
      page.getByRole("dialog", { name: /add expense/i })
    ).not.toBeVisible();
    // The new expense card is visible on the group page.
    await expect(
      page.getByTestId("expense-card").filter({ hasText: /tent rental/i })
    ).toBeVisible();
  });
});
