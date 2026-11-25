import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * End-to-end test flow for group creation and expense splitting (#612).
 *
 * Verifies the user journey:
 * 1. Connect wallet and sign in via mocked Freighter SEP-10 handshake.
 * 2. Create a new group.
 * 3. Open group detail, invite participant / ensure members are present.
 * 4. Record a shared expense with equal splitting.
 * 5. Verify the updated net balances and settlement suggestions.
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

const CURRENT_USER = {
  id: "user-alice",
  stellarPublicKey: "GBDIT4GPLGXKTQH2O2UYV7XKZPFT2OQ3GQ3H4J6B7Y5XGQY3UHMDXRUB",
  displayName: "Alice Stellar",
  avatarUrl: null,
  createdAt: "2026-09-20T10:00:00.000Z",
};

const PEER_USER = {
  id: "user-bob",
  stellarPublicKey: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  displayName: "Bob Testnet",
  avatarUrl: null,
  createdAt: "2026-09-20T10:00:00.000Z",
};

const GROUP = {
  id: "group-weekend-1",
  name: "Weekend Cabin",
  description: "Shared cabin expenses",
  createdByUserId: CURRENT_USER.id,
  treasuryEnabled: false,
  treasuryAccountPublicKey: null,
  treasuryRequiredSigners: null,
  archived: false,
  createdAt: "2026-09-20T10:00:00.000Z",
};

const MEMBERS = [
  {
    id: "member-alice",
    groupId: GROUP.id,
    userId: CURRENT_USER.id,
    role: "admin" as const,
    joinedAt: "2026-09-20T10:00:00.000Z",
    user: CURRENT_USER,
  },
  {
    id: "member-bob",
    groupId: GROUP.id,
    userId: PEER_USER.id,
    role: "member" as const,
    joinedAt: "2026-09-20T10:00:00.000Z",
    user: PEER_USER,
  },
];

const EXPENSE = {
  id: "expense-cabin-1",
  groupId: GROUP.id,
  payerUserId: CURRENT_USER.id,
  payer: CURRENT_USER,
  title: "Cabin Groceries",
  description: "Food and supplies",
  amount: "100",
  assetCode: "XLM",
  assetIssuer: null,
  splitType: "equal" as const,
  memo: null,
  receiptUrl: null,
  createdAt: "2026-09-21T10:00:00.000Z",
  shares: [
    {
      id: "share-alice",
      expenseId: "expense-cabin-1",
      userId: CURRENT_USER.id,
      user: CURRENT_USER,
      shareAmount: "50",
      status: "pending" as const,
    },
    {
      id: "share-bob",
      expenseId: "expense-cabin-1",
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

async function mockFreighterWallet(page: Page): Promise<void> {
  await page.addInitScript(
    ({ publicKey, networkPassphrase, network, networkName, networkUrl }) => {
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

test.describe.configure({ timeout: 120_000 });

test.describe("Group creation and expense splitting flow (#612)", () => {
  test("creates a group, adds participants, logs a shared expense, and displays calculated balances", async ({
    page,
  }) => {
    const state = { groupCreated: false, expenseCreated: false };

    await mockFreighterWallet(page);

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

      // -- Auth --
      if (path === "/api/auth/challenge" && method === "POST") {
        return json({
          transaction: "AAAAAgAAAAA=",
          networkPassphrase: NETWORK_PASSPHRASE,
        });
      }
      if (path === "/api/auth/verify" && method === "POST") {
        return json({ token: "e2e-mock-jwt", user: CURRENT_USER });
      }
      if (path === "/api/me") {
        return json({ user: CURRENT_USER });
      }

      // -- Groups --
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

      // -- Invites --
      if (path === `/api/groups/${GROUP.id}/invite` && method === "POST") {
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            invite: {
              id: "invite-1",
              groupId: GROUP.id,
              code: "CABIN2026",
              maxUses: 5,
              uses: 1,
              expiresAt: null,
              createdAt: "2026-09-20T10:00:00.000Z",
            },
          }),
        });
      }

      // -- Expenses --
      if (path === `/api/groups/${GROUP.id}/expenses` && method === "GET") {
        return json({ expenses: state.expenseCreated ? [EXPENSE] : [] });
      }
      if (path === `/api/groups/${GROUP.id}/expenses` && method === "POST") {
        state.expenseCreated = true;
        return json({ expense: EXPENSE });
      }

      // -- Balances / Ledger / Activity --
      if (path === `/api/groups/${GROUP.id}/balances`) {
        return json(state.expenseCreated ? BALANCES_AFTER : BALANCES_BEFORE);
      }
      if (path === `/api/groups/${GROUP.id}/ledger`) {
        return json(EMPTY_LEDGER);
      }
      if (path === `/api/groups/${GROUP.id}/activity`) {
        return json({ activities: [] });
      }

      // -- App Shell --
      if (path === "/api/history") {
        return json({ expenses: [], settlements: [], nextCursor: null });
      }
      if (path === "/api/anchors") {
        return json({ anchors: [] });
      }

      return noContent();
    });

    // 1. Sign in
    await page.goto("/login");
    await page.getByTestId("login-connect").click();
    await page.waitForURL(/\/dashboard/);

    // 2. Navigate to Groups
    await page.locator("aside").getByRole("link", { name: "Groups" }).click();
    await expect(page).toHaveURL(/\/groups$/);
    await expect(page.getByRole("heading", { name: /your groups/i })).toBeVisible();

    // 3. Create a Group
    await page.getByTestId("groups-create").click();
    const createDialog = page.getByRole("dialog", { name: /new group/i });
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel(/group name/i).fill(GROUP.name);
    await page.getByTestId("create-group-confirm").click();

    // Verify redirect to group detail page
    await page.waitForURL(new RegExp(`/groups/${GROUP.id}(?:\\?.*)?$`));
    await expect(
      page.getByRole("heading", { name: GROUP.name })
    ).toBeVisible();

    // 4. Verify Invite Modal (Adding / Inviting participants)
    const inviteBtn = page.getByRole("button", { name: /invite/i });
    if (await inviteBtn.isVisible()) {
      await inviteBtn.click();
      const inviteModal = page.getByRole("dialog", { name: /invite/i });
      await expect(inviteModal).toBeVisible();
      const closeBtn = inviteModal.getByRole("button", { name: /close|cancel|done/i }).first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        await page.keyboard.press("Escape");
      }
    }

    // 5. Add a Shared Expense
    await page.getByTestId("group-add-expense").click();
    const expenseDialog = page.getByRole("dialog", { name: /add expense/i });
    await expect(expenseDialog).toBeVisible();
    await expenseDialog.getByLabel(/^title$/i).fill(EXPENSE.title);
    await expenseDialog.getByLabel(/^amount$/i).fill(EXPENSE.amount);
    await page.getByTestId("add-expense-confirm").click();

    // Verify Expense is rendered in list
    await expect(page.getByText(EXPENSE.title).first()).toBeVisible();

    // 6. Verify calculated balances
    await expect(
      page.getByRole("heading", { name: "Net balances", exact: true })
    ).toBeVisible();

    const currentUserRow = page.locator(
      `[data-testid="balance-row"][data-user-id="${CURRENT_USER.id}"]`
    );
    const peerRow = page.locator(
      `[data-testid="balance-row"][data-user-id="${PEER_USER.id}"]`
    );

    await expect(currentUserRow).toContainText(CURRENT_USER.displayName);
    await expect(peerRow).toContainText(PEER_USER.displayName);
    await expect(currentUserRow).toContainText("+50.00 XLM");
    await expect(peerRow).toContainText("-50.00 XLM");
  });
});
