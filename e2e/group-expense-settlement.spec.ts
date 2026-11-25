import { expect, test, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The wallet has to report the network this build targets, or
 * `assertWalletNetwork` refuses the sign-in. CI exports
 * `NEXT_PUBLIC_STELLAR_NETWORK=testnet`, while a plain `npm run dev` defaults to
 * mainnet; the Playwright web server inherits this process's environment, so
 * reading the same variable keeps the mock and the app in step.
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

const MOCK_NETWORK_PASSPHRASE =
  NETWORK === "testnet"
    ? "Test SDF Network ; September 2015"
    : "Public Global Stellar Network ; September 2015";

// Real strkeys, so the address decodes wherever the app reads it as an account
// identity (settlement recipients and anchor destinations are validated).
const MOCK_PUBLIC_KEY =
  "GAWNUZTVWFEHLB6EGI7XDVJFFUODIPOFHW2A6PIGELHMJE5I2DEDVPKL";
const MOCK_MEMBER_BOB_KEY =
  "GBJBCG32YKROB2XLHCOGSSCQ3CYV6EECXAGURBRSVLWADSVQXW63SNT7";

const MOCK_USER = {
  id: "user-1",
  stellarPublicKey: MOCK_PUBLIC_KEY,
  displayName: "Alice Stellar",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const MOCK_MEMBER_BOB = {
  id: "user-2",
  stellarPublicKey: MOCK_MEMBER_BOB_KEY,
  displayName: "Bob Testnet",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const GROUP_ID = "grp-e2e-001";
const EXPENSE_ID = "exp-e2e-001";

const MOCK_GROUP = {
  id: GROUP_ID,
  name: "E2E Road Trip",
  description: "Playwright test group",
  createdByUserId: MOCK_USER.id,
  treasuryEnabled: false,
  treasuryAccountPublicKey: null,
  treasuryRequiredSigners: null,
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const MOCK_MEMBERS = [
  {
    id: "mem-1",
    groupId: GROUP_ID,
    userId: MOCK_USER.id,
    role: "admin",
    joinedAt: "2026-01-01T00:00:00.000Z",
    user: MOCK_USER,
  },
  {
    id: "mem-2",
    groupId: GROUP_ID,
    userId: MOCK_MEMBER_BOB.id,
    role: "member",
    joinedAt: "2026-01-01T00:00:00.000Z",
    user: MOCK_MEMBER_BOB,
  },
];

/** 100 XLM equal-split expense — Alice paid, Bob owes 50. */
const MOCK_EXPENSE = {
  id: EXPENSE_ID,
  groupId: GROUP_ID,
  payerUserId: MOCK_USER.id,
  payer: MOCK_USER,
  title: "E2E Dinner",
  description: null,
  amount: "100.0000000",
  assetCode: "XLM",
  assetIssuer: null,
  splitType: "equal",
  memo: null,
  receiptUrl: null,
  createdAt: "2026-01-15T12:00:00.000Z",
  shares: [
    {
      id: "sh-1",
      expenseId: EXPENSE_ID,
      userId: MOCK_USER.id,
      user: MOCK_USER,
      shareAmount: "50.0000000",
      status: "settled",
    },
    {
      id: "sh-2",
      expenseId: EXPENSE_ID,
      userId: MOCK_MEMBER_BOB.id,
      user: MOCK_MEMBER_BOB,
      shareAmount: "50.0000000",
      status: "pending",
    },
  ],
};

const MOCK_BALANCES = {
  balances: [
    { userId: MOCK_USER.id, user: MOCK_USER, net: "50.0000000", assetCode: "XLM" },
    { userId: MOCK_MEMBER_BOB.id, user: MOCK_MEMBER_BOB, net: "-50.0000000", assetCode: "XLM" },
  ],
  suggestions: [
    {
      fromUserId: MOCK_MEMBER_BOB.id,
      from: MOCK_MEMBER_BOB,
      toUserId: MOCK_USER.id,
      to: MOCK_USER,
      amount: "50.0000000",
      assetCode: "XLM",
      assetIssuer: null,
    },
  ],
};

const MOCK_LEDGER = {
  entries: [{ type: "expense", createdAt: MOCK_EXPENSE.createdAt, expense: MOCK_EXPENSE }],
  nextCursor: null,
};

const MOCK_ACTIVITY = { activities: [] };

// ---------------------------------------------------------------------------
// Noise patterns — framework-level errors that are not app bugs
// ---------------------------------------------------------------------------
const KNOWN_NOISE: RegExp[] = [
  /hydration failed/i,
  /react-hydration-error/i,
  /there was an error while hydrating/i,
  /cannot destructure property .* of .* as it is undefined/i,
  /ResizeObserver loop/i,
];

function isNoise(msg: string): boolean {
  return KNOWN_NOISE.some((re) => re.test(msg));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    if (!isNoise(err.message)) errors.push(err.message);
  });
  return errors;
}

/**
 * Mock the Freighter browser extension.
 *
 * Two layers:
 * 1. `window.freighter = true` — makes `isConnected()` short-circuit
 *    without a postMessage round-trip (the library checks this first).
 * 2. postMessage handler — covers every other API call: `getAddress`,
 *    `getNetworkDetails`, `signTransaction`, etc.
 */
async function mockFreighter(page: Page): Promise<void> {
  // Everything the handler reports is passed in: `addInitScript` serializes the
  // function, so module-level constants from the test process are not in scope
  // inside the browser.
  const wallet = {
    publicKey: MOCK_PUBLIC_KEY,
    networkPassphrase: MOCK_NETWORK_PASSPHRASE,
    network: NETWORK.toUpperCase(),
    networkName: NETWORK === "testnet" ? "Testnet" : "Public",
    networkUrl:
      NETWORK === "testnet"
        ? "https://horizon-testnet.stellar.org"
        : "https://horizon.stellar.org",
  };
  await page.addInitScript(
    ({ publicKey, networkPassphrase, network, networkName, networkUrl }) => {
      // isConnected() checks window.freighter before sending any message.
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
          case "REQUEST_ALLOWED":
          case "REQUEST_ACCESS":
          case "REQUEST_PUBLIC_KEY":
            payload = { publicKey };
            break;
          case "REQUEST_NETWORK":
            payload = { network };
            break;
          case "REQUEST_NETWORK_DETAILS":
            // Must be wrapped in `networkDetails` — that's what the library unpacks.
            payload = {
              networkDetails: {
                network,
                networkName,
                networkUrl,
                networkPassphrase,
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
          { source: "FREIGHTER_EXTERNAL_MSG_RESPONSE", messagedId: messageId, ...payload },
          "*"
        );
      });
    },
    wallet
  );
}

/**
 * Sign in through the mocked wallet and land on the dashboard.
 *
 * There is no shorter way in any more. #543 made the bearer token memory-only
 * (it never reaches Web Storage — see `src/lib/auth-store.ts` and the guard in
 * `src/lib/persistence.vitest.test.ts`), and the reader that rehydrates the
 * persisted identity accepts only the two public fields it validates. So the
 * hand-written session blob this suite used to seed with `page.addInitScript`
 * no longer buys a session: the token is not read back, and `AuthGuard` sends
 * the page to /login. Driving the real connect → challenge → sign → verify flow
 * is what a user does anyway, and it keeps every screen here behind an honest
 * session.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-connect").click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/**
 * `/groups`, reached by clicking.
 *
 * Client-side navigation only: `page.goto()` reloads the document, which drops
 * the in-memory token, and the guard bounces back to /login.
 */
async function openGroupsPage(page: Page): Promise<void> {
  await signIn(page);
  await page.locator("aside").getByRole("link", { name: "Groups" }).click();
  await expect(page).toHaveURL(/\/groups$/);
}

/** The mocked group's detail page, reached by clicking through from /groups. */
async function openGroupDetail(page: Page): Promise<void> {
  await openGroupsPage(page);
  await page.getByTestId("group-card").click();
  // The group page restates its paging default in the URL, so match the path.
  await expect(page).toHaveURL(new RegExp(`/groups/${GROUP_ID}(?:\\?.*)?$`));
}

/**
 * Wire up all API routes the groups + group-detail pages call.
 *
 * Specificity order matters: more-specific routes (/:id/expenses, /:id/balances,
 * /:id, etc.) are registered BEFORE the broad /groups list route so Playwright's
 * first-match routing doesn't swallow detail calls.
 */
async function mountGroupDetailMocks(
  page: Page,
  opts: { expenseList?: typeof MOCK_EXPENSE[] } = {}
): Promise<void> {
  const expenses = opts.expenseList ?? [MOCK_EXPENSE];

  // Auth
  await page.route("**/api/auth/challenge", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ transaction: "AAAAAgAAAAA=", networkPassphrase: MOCK_NETWORK_PASSPHRASE }),
    })
  );
  await page.route("**/api/auth/verify", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "mock-jwt-token", user: MOCK_USER }),
    })
  );
  await page.route("**/api/auth/refresh", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "mock-jwt-token", user: MOCK_USER }),
    })
  );

  // /api/me
  await page.route("**/api/me", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: MOCK_USER }),
    })
  );

  // Group-scoped detail routes (registered before the broad list route)
  await page.route(`**/api/groups/${GROUP_ID}/expenses`, async (route: Route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ expense: MOCK_EXPENSE }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ expenses }),
      });
    }
  });

  await page.route(`**/api/groups/${GROUP_ID}/balances`, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_BALANCES),
    })
  );

  await page.route(`**/api/groups/${GROUP_ID}/ledger`, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_LEDGER),
    })
  );

  await page.route(`**/api/groups/${GROUP_ID}/activity`, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_ACTIVITY),
    })
  );

  // /api/groups/:id detail (before the list route)
  await page.route(`**/api/groups/${GROUP_ID}`, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ group: MOCK_GROUP, members: MOCK_MEMBERS, yourRole: "admin" }),
    })
  );

  // /api/groups list + creation (broad regex registered last)
  await page.route(/\/api\/groups(\?.*)?$/, async (route: Route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ group: MOCK_GROUP }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          groups: [{ ...MOCK_GROUP, memberCount: 2, yourNet: "0.0000000", netAssetCode: "XLM" }],
        }),
      });
    }
  });

  // Cursor-paginated expense variant
  await page.route(/\/api\/expenses\?/, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: expenses, nextCursor: null }),
    })
  );

  // External Horizon & rate providers
  await page.route(/https:\/\/horizon(-testnet)?\.stellar\.org.*/, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ core_version: "20.0.0", network_passphrase: MOCK_NETWORK_PASSPHRASE }),
    })
  );

  await page.route(/https:\/\/api\.coingecko\.com.*/, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ stellar: { usd: 0.12 }, "usd-coin": { usd: 1.0 } }),
    })
  );

  await page.route(/https:\/\/api\.coinbase\.com.*/, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { amount: "0.12" } }),
    })
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Group expense and settlement flow", () => {
  // ── Authenticated tests ──────────────────────────────────────────────────
  test.describe("authenticated", () => {
    test.beforeEach(async ({ page }) => {
      await mockFreighter(page);
    });

    // 1. Groups page
    test("groups page renders the group list", async ({ page }) => {
      const errors = trackPageErrors(page);
      await mountGroupDetailMocks(page);
      await openGroupsPage(page);

      await expect(page.getByRole("heading", { name: /your groups/i })).toBeVisible();
      await expect(page.getByRole("heading", { name: /e2e road trip/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /new group/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /join group/i })).toBeVisible();

      expect(errors, `Unexpected errors on /groups:\n${errors.join("\n")}`).toEqual([]);
    });

    // 2. Create group dialog — POST fires and returns 201
    test("creates a new group via the dialog", async ({ page }) => {
      await mountGroupDetailMocks(page);
      await openGroupsPage(page);
      await expect(page.getByRole("heading", { name: /your groups/i })).toBeVisible();

      await page.getByRole("button", { name: /new group/i }).click();
      const dialog = page.getByRole("dialog", { name: /new group/i });
      await expect(dialog).toBeVisible();

      await page.getByLabel(/group name/i).fill("E2E Road Trip");
      await page.getByLabel(/description/i).fill("Playwright test group");

      const [response] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes("/api/groups") && r.request().method() === "POST"
        ),
        dialog.getByRole("button", { name: /^create group$/i }).click(),
      ]);

      expect(response.status()).toBe(201);
    });

    // 3. Group detail — renders header, expense count, expense card
    test("group detail page renders the header and expense list", async ({ page }) => {
      const errors = trackPageErrors(page);
      await mountGroupDetailMocks(page);
      await openGroupDetail(page);

      await expect(page.getByRole("heading", { name: /e2e road trip/i })).toBeVisible();
      await expect(page.getByText(/expenses \(1\)/i)).toBeVisible();
      await expect(page.getByText(/e2e dinner/i)).toBeVisible();
      await expect(page.getByText(/100/).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /add expense/i })).toBeVisible();

      expect(errors, `Unexpected errors on group detail:\n${errors.join("\n")}`).toEqual([]);
    });

    // 4. Add expense dialog — opens, fields are fillable, submit button is enabled
    test("adds a new expense via the dialog", async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "onLine", { get: () => true, configurable: true });
      });
      await mountGroupDetailMocks(page, { expenseList: [] });
      await openGroupDetail(page);
      await expect(page.getByText(/no expenses yet/i)).toBeVisible();

      await page.getByRole("button", { name: /add expense/i }).click();
      const dialog = page.getByRole("dialog", { name: /add expense/i });
      await expect(dialog).toBeVisible();

      const titleInput = dialog.getByLabel(/^title$/i);
      const amountInput = dialog.getByLabel(/^amount$/i);
      await expect(titleInput).toBeVisible();
      await expect(amountInput).toBeVisible();

      await titleInput.fill("E2E Dinner");
      await amountInput.fill("100");

      const submitBtn = dialog.getByRole("button", { name: /^add expense$/i });
      await expect(submitBtn).toBeVisible();
      await expect(submitBtn).not.toBeDisabled();
    });

    // The complete journey keeps the API stateful: the expense and resulting
    // balances only become visible after the create request succeeds. This
    // catches a regression where the form submits but the group view never
    // reflects the newly recorded split.
    test("creates a group, records a shared expense, and refreshes balances", async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "onLine", { get: () => true, configurable: true });
      });
      await mountGroupDetailMocks(page, { expenseList: [] });

      let expenseCreated = false;
      await page.route(`**/api/groups/${GROUP_ID}/expenses`, async (route: Route) => {
        if (route.request().method() === "POST") {
          expenseCreated = true;
          await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({ expense: MOCK_EXPENSE }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ expenses: expenseCreated ? [MOCK_EXPENSE] : [] }),
        });
      });
      await page.route(`**/api/groups/${GROUP_ID}/balances`, (route: Route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            expenseCreated
              ? MOCK_BALANCES
              : { balances: [], suggestions: [] }
          ),
        })
      );

      await openGroupDetail(page);
      await expect(page.getByText(/no expenses yet/i)).toBeVisible();

      await page.getByRole("button", { name: /add expense/i }).click();
      const dialog = page.getByRole("dialog", { name: /add expense/i });
      await dialog.getByLabel(/^title$/i).fill("E2E Dinner");
      await dialog.getByLabel(/^amount$/i).fill("100");
      await expect(dialog.getByTestId("split-row-user-1")).toContainText("Alice Stellar");
      await expect(dialog.getByTestId("split-row-user-2")).toContainText("Bob Testnet");

      const [response] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes(`/api/groups/${GROUP_ID}/expenses`) && r.request().method() === "POST"
        ),
        dialog.getByTestId("add-expense-confirm").click(),
      ]);
      expect(response.status()).toBe(201);

      await expect(
        page.getByRole("button", { name: /expand expense e2e dinner/i })
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: /^net balances$/i })).toBeVisible();
      await expect(page.getByText(/50\.0/).filter({ visible: true }).first()).toBeVisible();
    });

    // 5. Balances panel — correct net positions and settlement suggestion
    test("balances panel renders correct net positions", async ({ page }) => {
      const errors = trackPageErrors(page);
      await mountGroupDetailMocks(page);
      await openGroupDetail(page);

      await expect(page.getByRole("heading", { name: /^net balances$/i })).toBeVisible();
      await expect(page.getByText(/alice stellar/i).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText(/bob testnet/i).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText(/simplified settlement paths/i)).toBeVisible();
      await expect(page.getByText(/50\.0/).filter({ visible: true }).first()).toBeVisible();

      expect(errors, `Unexpected errors in settlement panel:\n${errors.join("\n")}`).toEqual([]);
    });

    // 6. Expense card — correct total and payer
    test("expense card renders the correct amount and payer", async ({ page }) => {
      await mountGroupDetailMocks(page);
      await openGroupDetail(page);

      await expect(page.getByText(/e2e dinner/i)).toBeVisible();
      await expect(page.getByText(/alice stellar/i).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText(/100/).filter({ visible: true }).first()).toBeVisible();
    });

    // 7. Empty state
    test("shows the empty state when a group has no expenses", async ({ page }) => {
      await mountGroupDetailMocks(page, { expenseList: [] });
      await openGroupDetail(page);

      await expect(page.getByText(/no expenses yet/i)).toBeVisible();
      await expect(page.getByText(/add the first expense/i)).toBeVisible();
    });

    // 8. Back button is rendered and links to /dashboard
    test("back button is visible and links to the dashboard", async ({ page }) => {
      await mountGroupDetailMocks(page);
      await openGroupDetail(page);

      const backBtn = page.getByRole("button", { name: /back to dashboard/i });
      await expect(backBtn).toBeVisible();
      await expect(backBtn).toBeEnabled();

      // The button sits inside a link that points to /dashboard
      await expect(page.locator('a[href="/dashboard"]').first()).toBeVisible();
    });

    // 9. "Everyone's square" when all balances are zero
    test("shows everyone's square when all balances are zero", async ({ page }) => {
      await mountGroupDetailMocks(page);

      // Override balances with all-zero values after the base mocks are set
      await page.route(`**/api/groups/${GROUP_ID}/balances`, (route: Route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            balances: [
              { userId: MOCK_USER.id, user: MOCK_USER, net: "0.0000000", assetCode: "XLM" },
              { userId: MOCK_MEMBER_BOB.id, user: MOCK_MEMBER_BOB, net: "0.0000000", assetCode: "XLM" },
            ],
            suggestions: [],
          }),
        })
      );

      await openGroupDetail(page);

      await expect(page.getByText(/simplified settlement paths/i)).toBeVisible();
      await expect(page.getByText(/everyone.s square/i)).toBeVisible();
    });
  });

  // ── Unauthenticated route guard ──────────────────────────────────────────
  // Intentionally isolated — no mockFreighter and no sign-in. With nothing
  // persisted and no wallet to ask, useSessionRestore settles the restore as
  // "logged out" and AuthGuard redirects to /login.
  test("redirects unauthenticated access to the group detail page to login", async ({
    page,
  }) => {
    await page.goto(`/groups/${GROUP_ID}`);
    await page.waitForURL(/\/login$/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });
});
