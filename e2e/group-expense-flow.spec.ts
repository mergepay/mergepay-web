import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * End-to-end coverage for the core Mergepay journey (#491):
 *
 *   sign in → create a group → add a shared expense → verify the resulting
 *   member balances.
 *
 * Everything external is mocked at the network boundary:
 *   - the Freighter extension protocol (same postMessage handshake the app
 *     uses in @stellar/freighter-api v4),
 *   - the `/api/*` BFF routes, with a *stateful* in-test store so a created
 *     group/expense is what the follow-up refetches read.
 *
 * No backend, Stellar network, or wallet extension is required, so the spec
 * runs headless in CI exactly as it does locally.
 */

/**
 * The wallet must report the same network this build targets, or
 * `assertWalletNetwork` refuses the sign-in. The `test:e2e` job runs
 * `npm run dev` without `NEXT_PUBLIC_STELLAR_NETWORK`, so the app defaults to
 * mainnet; reading the same variable here keeps the mock and the app in step.
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

const NETWORK_NAME = NETWORK === "testnet" ? "Testnet" : "Public";
const NETWORK_URL =
  NETWORK === "testnet"
    ? "https://horizon-testnet.stellar.org"
    : "https://horizon.stellar.org";

// Valid checksummed ed25519 public keys (see src/lib/strkey.ts).
const CURRENT_USER = {
  id: "user-1",
  stellarPublicKey: "GBDIT4GPLGXKTQH2O2UYV7XKZPFT2OQ3GQ3H4J6B7Y5XGQY3UHMDXRUB",
  displayName: "Test User",
  avatarUrl: null,
  createdAt: "2026-09-20T10:00:00.000Z",
};

const PEER_USER = {
  id: "user-2",
  stellarPublicKey: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  displayName: "Ada Lovelace",
  avatarUrl: null,
  createdAt: "2026-09-20T10:00:00.000Z",
};

const GROUP = {
  id: "group-1",
  name: "Apartment 4B",
  description: null,
  createdByUserId: CURRENT_USER.id,
  treasuryEnabled: false,
  treasuryAccountPublicKey: null,
  treasuryRequiredSigners: null,
  archived: false,
  createdAt: "2026-09-20T10:00:00.000Z",
};

const MEMBERS = [
  {
    id: "member-1",
    groupId: GROUP.id,
    userId: CURRENT_USER.id,
    role: "admin" as const,
    joinedAt: "2026-09-20T10:00:00.000Z",
    user: CURRENT_USER,
  },
  {
    id: "member-2",
    groupId: GROUP.id,
    userId: PEER_USER.id,
    role: "member" as const,
    joinedAt: "2026-09-20T10:00:00.000Z",
    user: PEER_USER,
  },
];

/** 100 XLM paid by the current user and split equally between both members. */
const EXPENSE = {
  id: "expense-1",
  groupId: GROUP.id,
  payerUserId: CURRENT_USER.id,
  payer: CURRENT_USER,
  title: "Dinner at Terra Kulture",
  description: null,
  amount: "100",
  assetCode: "XLM",
  assetIssuer: null,
  splitType: "equal" as const,
  memo: null,
  receiptUrl: null,
  createdAt: "2026-09-21T10:00:00.000Z",
  shares: [
    {
      id: "share-1",
      expenseId: "expense-1",
      userId: CURRENT_USER.id,
      user: CURRENT_USER,
      shareAmount: "50",
      status: "pending" as const,
    },
    {
      id: "share-2",
      expenseId: "expense-1",
      userId: PEER_USER.id,
      user: PEER_USER,
      shareAmount: "50",
      status: "pending" as const,
    },
  ],
};

const BALANCES_BEFORE = {
  balances: [
    { userId: CURRENT_USER.id, user: CURRENT_USER, net: "0", assetCode: "XLM" },
    { userId: PEER_USER.id, user: PEER_USER, net: "0", assetCode: "XLM" },
  ],
  suggestions: [],
};

// Payer (+100) minus own share (50) → +50; the other member owes 50.
const BALANCES_AFTER = {
  balances: [
    { userId: CURRENT_USER.id, user: CURRENT_USER, net: "50", assetCode: "XLM" },
    { userId: PEER_USER.id, user: PEER_USER, net: "-50", assetCode: "XLM" },
  ],
  suggestions: [
    {
      fromUserId: PEER_USER.id,
      from: PEER_USER,
      toUserId: CURRENT_USER.id,
      to: CURRENT_USER,
      amount: "50",
      assetCode: "XLM",
      assetIssuer: null,
    },
  ],
};

const EMPTY_LEDGER = { entries: [], nextCursor: null };

/**
 * Emulate the Freighter extension's postMessage protocol, exactly as the
 * library used by the app expects it.
 */
async function mockFreighter(page: Page): Promise<void> {
  await page.addInitScript(
    ({ publicKey, networkPassphrase, network, networkName, networkUrl }) => {
      // freighter-api checks this global first and short-circuits
      // `isConnected()` without a postMessage round-trip.
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
        // The library matches responses on `messagedId` (sic) with the
        // response fields at the top level.
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
      publicKey: CURRENT_USER.stellarPublicKey,
      networkPassphrase: NETWORK_PASSPHRASE,
      network: NETWORK.toUpperCase(),
      networkName: NETWORK_NAME,
      networkUrl: NETWORK_URL,
    }
  );
}

test.describe("Group creation and expense splitting flow", () => {
  test("creates a group, adds a split expense, and shows the resulting balances", async ({
    page,
  }) => {
    // Stateful fixtures: writes made through the UI are observable by the
    // follow-up refetches, mirroring a real backend.
    const state = { groupCreated: false, expenseCreated: false };

    await mockFreighter(page);

    await page.route("**/api/**", async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();

      const json = (body: unknown) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      const noContent = () => route.fulfill({ status: 204 });

      // -- auth -----------------------------------------------------------
      if (path === "/api/auth/challenge" && method === "POST") {
        return json({
          transaction: "AAAAAgAAAAA=",
          networkPassphrase: NETWORK_PASSPHRASE,
        });
      }
      if (path === "/api/auth/verify" && method === "POST") {
        return json({ token: "e2e-jwt-token", user: CURRENT_USER });
      }
      if (path === "/api/me") {
        return json({ user: CURRENT_USER });
      }

      // -- groups ---------------------------------------------------------
      if (path === "/api/groups" && method === "GET") {
        return json({
          groups: state.groupCreated
            ? [{ ...GROUP, memberCount: 2, yourNet: "0", netAssetCode: "XLM" }]
            : [],
        });
      }
      if (path === "/api/groups" && method === "POST") {
        state.groupCreated = true;
        return json({ group: GROUP });
      }
      if (path === `/api/groups/${GROUP.id}` && method === "GET") {
        return json({ group: GROUP, members: MEMBERS, yourRole: "admin" });
      }

      // -- expenses -------------------------------------------------------
      if (path === `/api/groups/${GROUP.id}/expenses` && method === "GET") {
        return json({ expenses: state.expenseCreated ? [EXPENSE] : [] });
      }
      if (path === `/api/groups/${GROUP.id}/expenses` && method === "POST") {
        state.expenseCreated = true;
        return json({ expense: EXPENSE });
      }

      // -- balances / ledger / activity -----------------------------------
      if (path === `/api/groups/${GROUP.id}/balances`) {
        return json(state.expenseCreated ? BALANCES_AFTER : BALANCES_BEFORE);
      }
      if (path === `/api/groups/${GROUP.id}/ledger`) {
        return json(EMPTY_LEDGER);
      }
      if (path === `/api/groups/${GROUP.id}/activity`) {
        return json({ activities: [] });
      }

      // -- authenticated shell (history, anchors, …) ----------------------
      if (path === "/api/history") {
        return json({ expenses: [], settlements: [], nextCursor: null });
      }
      if (path === "/api/anchors") {
        return json({ anchors: [] });
      }

      // Anything else the shell may probe degrades to "no content".
      return noContent();
    });

    // 1. Sign in through the mocked wallet + SEP-10 handshake.
    await page.goto("/login");
    await page.getByTestId("login-connect").click();
    await page.waitForURL(/\/dashboard/);

    // 2. Start from the (empty) group list. Client-side navigation only: the
    // bearer token is memory-only (#543), so a full page load would drop the
    // session and the guard would bounce back to /login.
    await page.locator("aside").getByRole("link", { name: "Groups" }).click();
    await expect(page).toHaveURL(/\/groups$/);
    await expect(page.getByRole("heading", { name: /your groups/i })).toBeVisible();

    // 3. Create a group.
    await page.getByTestId("groups-create").click();
    const createDialog = page.getByRole("dialog", { name: /new group/i });
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel(/group name/i).fill(GROUP.name);
    await page.getByTestId("create-group-confirm").click();

    // Lands on the new group's detail page.
    await page.waitForURL(new RegExp(`/groups/${GROUP.id}(?:\\?.*)?$`));
    await expect(
      page.getByRole("heading", { name: GROUP.name })
    ).toBeVisible();

    // 4. Add a shared expense.
    await page.getByTestId("group-add-expense").click();
    const expenseDialog = page.getByRole("dialog", { name: /add expense/i });
    await expect(expenseDialog).toBeVisible();
    await expenseDialog.getByLabel(/^title$/i).fill(EXPENSE.title);
    await expenseDialog.getByLabel(/^amount$/i).fill(EXPENSE.amount);
    await page.getByTestId("add-expense-confirm").click();

    // The expense is listed once the mutation settles and the list refetches.
    await expect(page.getByText(EXPENSE.title).first()).toBeVisible();

    // 5. The split is reflected in the member balances.
    await expect(
      page.getByRole("heading", { name: "Net balances", exact: true })
    ).toBeVisible();
    // Scoped to the balance rows: a bare text lookup for a member name also
    // matches the hidden <option> in the member picker.
    const currentUserRow = page.locator(
      `[data-testid="balance-row"][data-user-id="${CURRENT_USER.id}"]`
    );
    const peerRow = page.locator(
      `[data-testid="balance-row"][data-user-id="${PEER_USER.id}"]`
    );
    await expect(currentUserRow).toContainText(CURRENT_USER.displayName);
    await expect(peerRow).toContainText(PEER_USER.displayName);
    // Payer is owed 50 XLM; the other member owes 50 XLM.
    await expect(currentUserRow).toContainText("+50.00 XLM");
    await expect(peerRow).toContainText("-50.00 XLM");
  });
});
