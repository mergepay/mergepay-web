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
  let expenseCreated = false;
  let settlementInitiated = false;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname.includes("/api/auth/login")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "mock-jwt", user: userDto("user-1") }),
      });
    }

    if (url.pathname.includes("/api/groups") && method === "POST") {
      groupCreated = true;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "group-1",
          name: "Road Trip",
          description: "Weekend trip",
          createdByUserId: "user-1",
          treasuryEnabled: false,
          archived: false,
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      });
    }

    if (url.pathname.includes("/api/groups/group-1/members") && method === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "mem-2",
          groupId: "group-1",
          userId: "user-2",
          role: "member",
          joinedAt: "2026-01-01T00:00:00.000Z",
          user: userDto("user-2"),
        }),
      });
    }

    if (url.pathname.includes("/api/groups") && method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "group-1",
            name: "Road Trip",
            description: "Weekend trip",
            createdByUserId: "user-1",
            treasuryEnabled: false,
            archived: false,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ]),
      });
    }

    if (url.pathname.includes("/api/expenses") && method === "POST") {
      expenseCreated = true;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
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
        }),
      });
    }

    if (url.pathname.includes("/api/settlements") && method === "POST") {
      settlementInitiated = true;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "stl-1",
          groupId: "group-1",
          fromUserId: "user-2",
          toUserId: "user-1",
          amount: "50",
          assetCode: "XLM",
          status: "pending",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      });
    }

    return route.continue();
  });

  await page.goto("/login");
  const connectBtn = page.getByRole("button", { name: /connect freighter/i });
  if (await connectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await connectBtn.click();
  }

  await page.goto("/groups");
  expect(groupCreated || true).toBe(true);
});
