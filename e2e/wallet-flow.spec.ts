import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Mock Freighter wallet injection and API responses
  await page.addInitScript(() => {
    (window as any).freighter = {
      isConnected: async () => true,
      requestAccess: async () => "GAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXDV",
      getAddress: async () => "GAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXDV",
      getNetwork: async () => "TESTNET",
      signTransaction: async (xdr: string) => xdr,
    };
  });

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
