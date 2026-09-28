import { expect, test, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOCK_PUBLIC_KEY =
  "GAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXDV";
const MOCK_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

const MOCK_USER = {
  id: "user-1",
  stellarPublicKey: MOCK_PUBLIC_KEY,
  displayName: "Alice Stellar",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const MOCK_MEMBER_BOB = {
  id: "user-2",
  stellarPublicKey: "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXDV",
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
  await page.addInitScript(
    ({ publicKey, networkPassphrase }) => {
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
          case "REQUEST_ACCESS":
          case "REQUEST_PUBLIC_KEY":
            payload = { publicKey };
            break;
          case "REQUEST_NETWORK":
            payload = { network: "TESTNET" };
            break;
          case "REQUEST_NETWORK_DETAILS":
            // Must be wrapped in `networkDetails` — that's what the library unpacks.
            payload = {
              networkDetails: {
                network: "TESTNET",
                networkPassphrase,
                networkUrl: "https://horizon-testnet.stellar.org",
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
    { publicKey: MOCK_PUBLIC_KEY, networkPassphrase: MOCK_NETWORK_PASSPHRASE }
  );
}

/**
 * Seed a fully authenticated session before the page boots.
 *
 * Writes the Zustand `useAuth` sessionStorage key with `token`,
 * `user`, `lastAuthenticatedAt`, and `restoreStatus: "settled"` so:
 *   - `useAuth(s => s.token)` returns non-null immediately.
 *   - `useSessionRestore` skips its async Freighter check (guards on
 *     `restoreStatus !== "idle"`).
 *   - `AuthGuard` renders children instead of the loading spinner.
 */
async function seedAuthSession(page: Page): Promise<void> {
  await page.addInitScript(
    ({ user, token }) => {
      try {
        const session = {
          state: {
            token,
            user,
            lastAuthenticatedAt: new Date().toISOString(),
            activeWalletPublicKey: user.stellarPublicKey,
            restoreStatus: "settled",
          },
          version: 0,
        };
        sessionStorage.setItem("mergepay.token", JSON.stringify(session));
      } catch {
        // sessionStorage disabled — tests degrade gracefully.
      }
    },
    { user: MOCK_USER, token: "mock-jwt-token" }
  );
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
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Group expense and settlement flow", () => {
  // ── Authenticated tests ──────────────────────────────────────────────────
  test.describe("authenticated", () => {
    test.beforeEach(async ({ page }) => {
      await mockFreighter(page);
      await seedAuthSession(page);
    });

    // 1. Groups page
    test("groups page renders the group list", async ({ page }) => {
      const errors = trackPageErrors(page);
      await mountGroupDetailMocks(page);
      await page.goto("/groups");
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: /your groups/i })).toBeVisible();
      await expect(page.getByRole("heading", { name: /e2e road trip/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /new group/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /join group/i })).toBeVisible();

      expect(errors, `Unexpected errors on /groups:\n${errors.join("\n")}`).toEqual([]);
    });

    // 2. Create group dialog — POST fires and returns 201
    test("creates a new group via the dialog", async ({ page }) => {
      await mountGroupDetailMocks(page);
      await page.goto("/groups");
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: /your groups/i })).toBeVisible();

      await page.getByRole("button", { name: /new group/i }).click();
      await expect(page.getByRole("dialog", { name: /new group/i })).toBeVisible();

      await page.getByLabel(/group name/i).fill("E2E Road Trip");
      await page.getByLabel(/description/i).fill("Playwright test group");

      const [response] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes("/api/groups") && r.request().method() === "POST"
        ),
        page.getByRole("button", { name: /^create group$/i }).click(),
      ]);

      expect(response.status()).toBe(201);
    });

    // 3. Group detail — renders header, expense count, expense card
    test("group detail page renders the header and expense list", async ({ page }) => {
      const errors = trackPageErrors(page);
      await mountGroupDetailMocks(page);
      await page.goto(`/groups/${GROUP_ID}`);
      await page.waitForLoadState("networkidle");

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
      await page.goto(`/groups/${GROUP_ID}`);
      await page.waitForLoadState("networkidle");
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

    // 5. Balances panel — correct net positions and settlement suggestion
    test("balances panel renders correct net positions", async ({ page }) => {
      const errors = trackPageErrors(page);
      await mountGroupDetailMocks(page);
      await page.goto(`/groups/${GROUP_ID}`);

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
      await page.goto(`/groups/${GROUP_ID}`);

      await expect(page.getByText(/e2e dinner/i)).toBeVisible();
      await expect(page.getByText(/alice stellar/i).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByText(/100/).filter({ visible: true }).first()).toBeVisible();
    });

    // 7. Empty state
    test("shows the empty state when a group has no expenses", async ({ page }) => {
      await mountGroupDetailMocks(page, { expenseList: [] });
      await page.goto(`/groups/${GROUP_ID}`);

      await expect(page.getByText(/no expenses yet/i)).toBeVisible();
      await expect(page.getByText(/add the first expense/i)).toBeVisible();
    });

    // 8. Back button is rendered and links to /dashboard
    test("back button is visible and links to the dashboard", async ({ page }) => {
      await mountGroupDetailMocks(page);
      await page.goto(`/groups/${GROUP_ID}`);

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

      await page.goto(`/groups/${GROUP_ID}`);

      await expect(page.getByText(/simplified settlement paths/i)).toBeVisible();
      await expect(page.getByText(/everyone.s square/i)).toBeVisible();
    });
  });

  // ── Unauthenticated route guard ──────────────────────────────────────────
  // Intentionally isolated — no mockFreighter, no seedAuthSession.
  // Without window.freighter and without a persisted session, useSessionRestore
  // calls forgetWallet() and AuthGuard redirects to /login.
  test("redirects unauthenticated access to the group detail page to login", async ({
    page,
  }) => {
    await page.goto(`/groups/${GROUP_ID}`);
    await page.waitForURL(/\/login$/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });
});
