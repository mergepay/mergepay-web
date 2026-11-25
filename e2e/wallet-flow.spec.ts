import { expect, test } from "@playwright/test";

/**
 * E2E smoke tests for wallet connection and core navigation flows.
 *
 * Verifies:
 *   - Navigation from landing page to login screen
 *   - Wallet connection interface elements (Freighter connect button)
 *   - Core UI layout elements and route handling
 */

test.describe("wallet connection and navigation flow", () => {
  test("navigates from home to login and displays wallet connection button", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);

    // Click login / connect action in header
    await page.locator('header a[href="/login"]').click();
    await expect(page).toHaveURL(/\/login$/);

    // Verify sign in header and wallet connect button are visible
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    const connectButton = page.getByRole("button", { name: /connect freighter/i });
    await expect(connectButton).toBeVisible();
  });

  test("verifies protected routes redirect unauthenticated users cleanly", async ({ page }) => {
    await page.goto("/groups");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: /connect freighter/i })).toBeVisible();
  });
});


const MOCK_PUBLIC_KEY = "GAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXDV";

const MOCK_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";