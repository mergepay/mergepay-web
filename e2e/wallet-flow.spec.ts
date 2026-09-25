import { test, expect } from "@playwright/test";

const MOCK_PUBLIC_KEY = "GAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXDV";
const MOCK_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

test.beforeEach(async ({ page }) => {
  // Emulate the Freighter extension's postMessage protocol used by
  // @stellar/freighter-api v4 (window.freighter methods are not called
  // directly; every call is a FREIGHTER_EXTERNAL_MSG_REQUEST exchange).
  await page.addInitScript(
    ({ publicKey, networkPassphrase }) => {
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
            payload = { network: "TESTNET", networkPassphrase };
            break;
          case "SUBMIT_TRANSACTION":
            payload = { signedTransaction: String(data.transactionXdr ?? "") };
            break;
          default:
            return;
        }
        // The library matches responses on `messagedId` (sic) echoing the
        // request's `messageId`, with the response fields at top level.
        window.postMessage(
          { source: "FREIGHTER_EXTERNAL_MSG_RESPONSE", messagedId: messageId, ...payload },
          "*"
        );
      });
    },
    { publicKey: MOCK_PUBLIC_KEY, networkPassphrase: MOCK_NETWORK_PASSPHRASE }
  );

  // Mock API endpoints for authentication and user data
  await page.route("**/api/auth/challenge", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        transaction: "AAAAAgAAAAA=",
        networkPassphrase: "Test SDF Network ; September 2015",
      }),
    });
  });

  await page.route("**/api/auth/verify", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token: "mock-jwt-token",
        user: {
          id: "u-1",
          stellarPublicKey: "GAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXDV",
          displayName: "Test User",
          avatarUrl: null,
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "u-1",
          stellarPublicKey: "GAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXDV",
          displayName: "Test User",
          avatarUrl: null,
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.route("**/api/groups**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ groups: [] }),
    });
  });
});

test("loads home page successfully", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText(/Mergepay/i);
});

test("completes wallet connection and login flow", async ({ page }) => {
  await page.goto("/login");

  const connectButton = page.locator("button", { hasText: /Connect Freighter|Connect Wallet/i });
  if (await connectButton.count() > 0) {
    await connectButton.first().click();
  } else {
    // Fallback if button text differs slightly
    await page.locator("button").first().click();
  }

  // Verify redirection or authenticated view presence
  await page.waitForURL(/\/dashboard|\/groups/);
  await expect(page).toHaveURL(/\/dashboard|\/groups/);
});
