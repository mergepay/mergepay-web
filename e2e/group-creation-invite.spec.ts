import { test, expect, type Page } from "@playwright/test";

/**
 * Issue #706 — End-to-end flow for group creation and member invitation.
 *
 * Drives the real UI (login → groups list → create dialog → group detail →
 * invite dialog → back to the list) against a mocked API so the suite runs
 * deterministically in local and CI environments without real secret keys,
 * a funded testnet account, or the mergepay-api backend.
 *
 * Assertions cover successful UI rendering (headings, dialogs, invite code)
 * and navigation updates (URL changes, list refresh after the mutation).
 */

const MOCK_PUBLIC_KEY = "GAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXDV";
const GROUP_ID = "group-e2e-1";
const INVITE_CODE = "GRP7X9K2QZ";
const INVITE_URL = "http://localhost:3000/join/GRP7X9K2QZ";
const NOW = "2026-10-26T09:00:00.000Z";

/**
 * Passphrases by configured network, mirroring src/lib/constants.ts.
 *
 * The login screen rejects a wallet reporting a different network than the
 * build targets, so the mocked wallet must report the passphrase this build
 * is configured for — derived from the same `NEXT_PUBLIC_STELLAR_NETWORK`
 * variable the dev server (started by playwright.config.ts) inherits.
 */
const PASSPHRASES: Record<string, string> = {
  public: "Public Global Stellar Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015",
  pubnet: "Public Global Stellar Network ; September 2015",
  testnet: "Test SDF Network ; September 2015",
  test: "Test SDF Network ; September 2015",
};
const NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "public").trim().toLowerCase();
const NETWORK_PASSPHRASE = PASSPHRASES[NETWORK] ?? PASSPHRASES.public;
/** Freighter's label for the configured network (`TESTNET` / `PUBLIC`). */
const NETWORK_LABEL =
  NETWORK_PASSPHRASE === "Test SDF Network ; September 2015" ? "TESTNET" : "PUBLIC";

const user = {
  id: "user-e2e",
  stellarPublicKey: MOCK_PUBLIC_KEY,
  displayName: "E2E Tester",
  avatarUrl: null,
  createdAt: NOW,
};

/** What the mocked backend recorded, so tests can assert on requests. */
interface RecordedRequests {
  createdGroup: { name: string; description?: string } | null;
  createdInvite: { maxUses?: number; expiresInHours?: number } | null;
}

/**
 * Emulate the Freighter extension's postMessage protocol used by
 * @stellar/freighter-api v4, including the shape the wallet-change watcher
 * reads (a nested `networkDetails` object), so the session is not logged out
 * mid-test.
 */
async function installWalletMock(page: Page) {
  await page.addInitScript(
    ({
      publicKey,
      networkPassphrase,
      network,
    }: {
      publicKey: string;
      networkPassphrase: string;
      network: string;
    }) => {
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
          case "REQUEST_ALLOWED_STATUS":
            payload = { isAllowed: true };
            break;
          case "REQUEST_ACCESS":
          case "REQUEST_PUBLIC_KEY":
            payload = { publicKey };
            break;
          case "REQUEST_NETWORK":
            payload = { network };
            break;
          case "REQUEST_NETWORK_DETAILS":
            payload = {
              network,
              networkPassphrase,
              networkDetails: {
                network,
                networkName: network,
                networkUrl: "https://horizon.stellar.org",
                networkPassphrase,
                sorobanRpcUrl: "",
                apiError: "",
              },
            };
            break;
          case "SUBMIT_TRANSACTION":
            payload = { signedTransaction: String(data.transactionXdr ?? "") };
            break;
          default:
            return;
        }
        // The library matches responses on `messagedId` (sic), echoing the
        // request's `messageId`, with the response fields at top level.
        window.postMessage(
          { source: "FREIGHTER_EXTERNAL_MSG_RESPONSE", messagedId: messageId, ...payload },
          "*"
        );
      });
    },
    {
      publicKey: MOCK_PUBLIC_KEY,
      networkPassphrase: NETWORK_PASSPHRASE,
      network: NETWORK_LABEL,
    }
  );
}

/**
 * Mock every `/api/*` call the flow makes. The handler is stateful: once a
 * group is created, the list endpoint reports it, which is what lets the test
 * verify the post-mutation cache refresh on the groups page.
 */
async function installApiMock(page: Page): Promise<RecordedRequests> {
  const recorded: RecordedRequests = { createdGroup: null, createdInvite: null };
  let createdGroup: Record<string, unknown> | null = null;

  const group = {
    id: GROUP_ID,
    name: "Lagos Trip 2026",
    description: "Shared spending for the October trip",
    createdByUserId: user.id,
    treasuryEnabled: false,
    treasuryAccountPublicKey: null,
    treasuryRequiredSigners: null,
    archived: false,
    createdAt: NOW,
  };

  await page.route(/\/api\//, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    // -- auth ----------------------------------------------------------------
    if (pathname === "/api/auth/challenge" && method === "POST") {
      return json({ transaction: "AAAAAgAAAAA=", networkPassphrase: NETWORK_PASSPHRASE });
    }
    if (pathname === "/api/auth/verify" && method === "POST") {
      return json({ token: "mock-jwt-token", user });
    }
    if (pathname === "/api/me") {
      return json({ user });
    }
    if (pathname === "/api/health") {
      return json({
        status: "ok",
        uptime: 1,
        timestamp: NOW,
        dependencies: { api: "ok", stellar: "ok" },
      });
    }

    // -- group list + creation ------------------------------------------------
    if (pathname === "/api/groups" && method === "POST") {
      const body = request.postDataJSON() as { name: string; description?: string };
      recorded.createdGroup = body;
      createdGroup = { ...group, name: body.name, description: body.description ?? null };
      return json({ group: createdGroup });
    }
    if (pathname === "/api/groups" && method === "GET") {
      return json({
        groups: createdGroup
          ? [{ ...createdGroup, memberCount: 1, yourNet: "0", netAssetCode: "XLM" }]
          : [],
      });
    }

    // -- group-scoped routes --------------------------------------------------
    const match = pathname.match(/^\/api\/groups\/([^/]+)(?:\/([^/]+))?$/);
    if (match) {
      const [, id, sub] = match;
      if (id !== GROUP_ID) {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "group_not_found" }),
        });
      }

      if (!sub && method === "GET") {
        return json({
          group: createdGroup ?? group,
          members: [
            {
              id: "gm-1",
              groupId: GROUP_ID,
              userId: user.id,
              role: "admin",
              joinedAt: NOW,
              user,
            },
          ],
          yourRole: "admin",
        });
      }

      switch (sub) {
        case "expenses":
          return json({ expenses: [] });
        case "balances":
          return json({
            balances: [{ userId: user.id, user, net: "0", assetCode: "XLM" }],
            suggestions: [],
          });
        case "ledger":
          return json({ entries: [], nextCursor: null });
        case "activity":
          return json({ activities: [] });
        case "invite":
          if (method === "POST") {
            const body = request.postDataJSON() as { maxUses?: number; expiresInHours?: number };
            recorded.createdInvite = body;
            return json({
              invite: {
                id: "invite-1",
                groupId: GROUP_ID,
                code: INVITE_CODE,
                url: INVITE_URL,
                expiresAt: null,
                maxUses: body.maxUses ?? null,
                uses: 0,
                createdAt: NOW,
              },
            });
          }
          break;
      }
    }

    // Anything else falls through to the app's own route (or a 404).
    return route.continue();
  });

  return recorded;
}

/** Sign in through the real login screen with the mocked wallet + API. */
async function signIn(page: Page) {
  await page.goto("/login");
  const connect = page.getByRole("button", { name: /connect freighter/i });
  await expect(connect).toBeVisible();
  await connect.click();
  await page.waitForURL(/\/dashboard|\/groups/);
}

/** Navigate to the groups list through the sidebar. */
async function goToGroups(page: Page) {
  await page.getByRole("link", { name: "Groups", exact: true }).first().click();
  await expect(page).toHaveURL(/\/groups$/);
}

/** Fill in and submit the create-group dialog. */
async function submitGroup(page: Page, name: string, description: string) {
  const dialog = page.getByRole("dialog", { name: "New group" });
  await dialog.getByLabel("Group name").fill(name);
  await dialog.getByLabel("Description (optional)").fill(description);
  await dialog.getByRole("button", { name: "Create group" }).click();
}

/** Wait until the router has landed on the new group's detail page. */
async function expectGroupDetailUrl(page: Page) {
  await expect(page).toHaveURL(new RegExp(`/groups/${GROUP_ID}(\\?.*)?$`));
}

test("creates an expense group and navigates to its detail page", async ({ page }) => {
  test.setTimeout(120_000);
  await installWalletMock(page);
  const recorded = await installApiMock(page);

  await signIn(page);
  await goToGroups(page);

  // Empty state renders before anything exists.
  await expect(page.getByRole("heading", { name: "Your Groups" })).toBeVisible();
  await expect(page.getByText("No groups yet")).toBeVisible();

  await page.getByRole("button", { name: "Create group" }).click();
  const dialog = page.getByRole("dialog", { name: "New group" });
  await expect(dialog).toBeVisible();

  await submitGroup(page, "Lagos Trip 2026", "Shared spending for the October trip");

  // Success feedback is a transient sonner toast (4s). Assert it first, right
  // after the mutation resolves: waiting on the client-side navigation below
  // can outlive the toast when the route still has to compile.
  await expect(page.getByText("Group created")).toBeVisible();

  // Navigation update: we are on the new group's page, not the list.
  await expectGroupDetailUrl(page);
  await expect(page.getByRole("heading", { level: 1, name: "Lagos Trip 2026" })).toBeVisible();
  await expect(page.getByText("Shared spending for the October trip")).toBeVisible();
  await expect(page.getByRole("button", { name: /add expense/i })).toBeVisible();

  // The mutation payload carried what the form collected.
  expect(recorded.createdGroup).toEqual({
    name: "Lagos Trip 2026",
    description: "Shared spending for the October trip",
  });
});

test("generates a member invite and shows the new group in the list", async ({ page }) => {
  test.setTimeout(120_000);
  await installWalletMock(page);
  const recorded = await installApiMock(page);

  await signIn(page);
  await goToGroups(page);
  await page.getByRole("button", { name: "Create group" }).click();
  await submitGroup(page, "Lagos Trip 2026", "Shared spending for the October trip");
  await expectGroupDetailUrl(page);

  // Open the invite dialog from the group page. Its title is
  // "Invite to <group name>", so match on the leading word only.
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const inviteDialog = page.getByRole("dialog", { name: /^Invite/ });
  await expect(inviteDialog).toBeVisible();

  await inviteDialog.getByRole("button", { name: "Generate invite" }).click();

  // The generated invite renders: code, share link and the invite actions.
  await expect(inviteDialog.locator("code", { hasText: INVITE_CODE })).toBeVisible();
  await expect(inviteDialog.getByRole("textbox").first()).toHaveValue(INVITE_URL);
  await expect(inviteDialog.getByRole("button", { name: "New invite" })).toBeVisible();
  expect(recorded.createdInvite).toMatchObject({ expiresInHours: 168 });

  await inviteDialog.getByRole("button", { name: "Done" }).click();
  await expect(inviteDialog).toBeHidden();

  // Navigation update: back to the list, which now reflects the mutation.
  await goToGroups(page);
  await expect(page.getByRole("heading", { name: "Your Groups" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lagos Trip 2026" })).toBeVisible();
  await expect(page.getByText("1 member")).toBeVisible();
  await expect(page.getByText("No groups yet")).toBeHidden();
});
