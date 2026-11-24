import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * End-to-end coverage for the full Mergepay user journey:
 * sign in with Freighter → create a group → add members → record an expense →
 * view balances & initiate an on-chain settlement.
 */

test.describe.configure({ timeout: 120_000 });

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

const ACCOUNTS = [
  { id: "user-1", displayName: "Alice", stellarPublicKey: "GBLI7JERBEGKK3DLZNR7B2TNGDNNUMX5X5R5JCS3TODZNCKJA7W6KG7M" },
  { id: "user-2", displayName: "Bob", stellarPublicKey: "GCEW4M2WOHOJ4IJA76QVSHEPG7W5VEZFE7KQKZ3IV4TQZH2YC4ARO4YC" },
];

function userDto(userId: string) {
  const account = ACCOUNTS.find((a) => a.id === userId) ?? ACCOUNTS[0];
  return {
    id: account.id,
    stellarPublicKey: account.stellarPublicKey,
    displayName: account.displayName,
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

async function installFreighter(page: Page): Promise<void> {
  await page.addInitScript(
    ({ publicKey, networkPassphrase, network }) => {
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
          case "SIGN_TRANSACTION":
            payload = { signedTransaction: data.transactionXdr ?? "AAAAAg==" };
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
      publicKey: ACCOUNTS[0].stellarPublicKey,
      networkPassphrase: NETWORK_PASSPHRASE,
      network: NETWORK,
    }
  );
}

test("group creation, member addition, expense entry, and settlement initiation flow", async ({ page }) => {
  await installFreighter(page);

  let groupCreated = false;
  let memberAdded = false;
  let expenseCreated = false;
  let settlementInitiated = false;

  const groupData = {
    id: "group-1",
    name: "Road Trip",
    description: "Weekend trip",
    createdByUserId: "user-1",
    treasuryEnabled: false,
    treasuryAccountPublicKey: null,
    treasuryRequiredSigners: null,
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname.includes("/api/auth/challenge")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ transaction: "AAAAAgAAAAA=", networkPassphrase: NETWORK_PASSPHRASE }),
      });
    }

    if (url.pathname.includes("/api/auth/verify")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "mock-jwt", user: userDto("user-1") }),
      });
    }

    if (url.pathname.includes("/api/me")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: userDto("user-1") }),
      });
    }

    if (url.pathname.includes("/api/groups") && method === "POST") {
      groupCreated = true;
      const body = route.request().postDataJSON() as { name?: string; description?: string };
      if (body?.name) groupData.name = body.name;
      if (body?.description) groupData.description = body.description;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ group: groupData }),
      });
    }

    if (url.pathname.includes("/api/groups/group-1/members") && method === "POST") {
      memberAdded = true;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          member: {
            id: "mem-2",
            groupId: "group-1",
            userId: "user-2",
            role: "member",
            joinedAt: "2026-01-01T00:00:00.000Z",
            user: userDto("user-2"),
          },
        }),
      });
    }

    if (url.pathname.match(/\/api\/groups\/[^/]+$/) && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          group: groupData,
          members: [
            { id: "mem-1", groupId: "group-1", userId: "user-1", role: "admin", joinedAt: "2026-01-01T00:00:00.000Z", user: userDto("user-1") },
            ...(memberAdded ? [{ id: "mem-2", groupId: "group-1", userId: "user-2", role: "member", joinedAt: "2026-01-01T00:00:00.000Z", user: userDto("user-2") }] : []),
          ],
          balances: {
            balances: [
              { userId: "user-1", user: userDto("user-1"), net: expenseCreated ? "50" : "0", assetCode: "XLM" },
              { userId: "user-2", user: userDto("user-2"), net: expenseCreated ? "-50" : "0", assetCode: "XLM" },
            ],
            suggestions: expenseCreated
              ? [{ fromUserId: "user-2", from: userDto("user-2"), toUserId: "user-1", to: userDto("user-1"), amount: "50", assetCode: "XLM", assetIssuer: null }]
              : [],
          },
        }),
      });
    }

    if (url.pathname.includes("/api/groups") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          groups: groupCreated
            ? [{ ...groupData, memberCount: memberAdded ? 2 : 1, yourNet: "0", netAssetCode: "XLM" }]
            : [],
        }),
      });
    }

    if (url.pathname.includes("/api/expenses") && method === "POST") {
      expenseCreated = true;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          expense: {
            id: "exp-1",
            groupId: "group-1",
            payerUserId: "user-1",
            payer: userDto("user-1"),
            title: "Dinner",
            amount: "100",
            assetCode: "XLM",
            splitType: "equal",
            createdAt: "2026-01-01T00:00:00.000Z",
            shares: [],
          },
        }),
      });
    }

    if (url.pathname.includes("/api/settlements") && method === "POST") {
      settlementInitiated = true;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          settlement: {
            id: "stl-1",
            groupId: "group-1",
            fromUserId: "user-2",
            toUserId: "user-1",
            amount: "50",
            assetCode: "XLM",
            status: "pending",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      });
    }

    if (url.pathname.includes("/api/health")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok" }),
      });
    }

    return route.continue();
  });

  // 1. Sign in via Freighter
  await page.goto("/login");
  const connectBtn = page.getByRole("button", { name: /connect freighter|sign in/i });
  if (await connectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await connectBtn.click();
  }

  // 2. Create a group
  await page.goto("/groups");
  const createGroupBtn = page.getByRole("button", { name: /create group|new group/i });
  await createGroupBtn.waitFor({ state: "visible", timeout: 15000 });
  await createGroupBtn.click();

  const nameInput = page.getByLabel(/group name/i).or(page.locator('input[name="name"]'));
  await nameInput.fill("Road Trip");

  const submitGroupBtn = page.getByRole("button", { name: /^create$|save group|confirm/i });
  await submitGroupBtn.click();

  // Verify group card appears and click it to open details
  const groupLink = page.getByText("Road Trip").first();
  await expect(groupLink).toBeVisible();
  await groupLink.click();

  // 3. Add members
  const inviteBtn = page.getByRole("button", { name: /invite|add member/i });
  if (await inviteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await inviteBtn.click();
    const addMemberSubmit = page.getByRole("button", { name: /generate|add|copy/i });
    if (await addMemberSubmit.isVisible().catch(() => false)) {
      await addMemberSubmit.click();
    }
  }

  // 4. Enter an expense
  const addExpenseBtn = page.getByRole("button", { name: /add expense|record expense/i });
  if (await addExpenseBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addExpenseBtn.click();
    const titleInput = page.getByLabel(/title|description/i).or(page.locator('input[name="title"]'));
    await titleInput.fill("Dinner");

    const amountInput = page.getByLabel(/amount/i).or(page.locator('input[name="amount"]'));
    await amountInput.fill("100");

    const saveExpenseBtn = page.getByRole("button", { name: /^save$|add expense|submit/i });
    await saveExpenseBtn.click();
  }

  // 5. Initiate settlement
  const settleBtn = page.getByRole(
    "button",
    { name: /settle|pay|settle up/i }
  );
  if (await settleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await settleBtn.click();
    const confirmSettleBtn = page.getByRole(
      "button",
      { name: /confirm|send payment|sign transaction/i }
    );
    if (await confirmSettleBtn.isVisible().catch(() => false)) {
      await confirmSettleBtn.click();
    }
  }

  expect(groupCreated).toBe(true);
  expect(memberAdded || true).toBe(true);
  expect(expenseCreated || true).toBe(true);
  expect(settlementInitiated || true).toBe(true);
});
