import { expect, signIn, test, USDC_ISSUER, type FakeMergePayApi } from "./fixtures/mergepay";
import type { Page } from "@playwright/test";

/**
 * End-to-end regression coverage for Treasury Mode and the SEP-24 anchor
 * deposit flow (#902).
 *
 * Runs fully offline on the shared `mergepay` fixture: the MergePay API,
 * Freighter and Horizon are all faked, and every off-origin request
 * (CoinGecko, the anchor's interactive page) is answered locally. The fake
 * wallet and Horizon answer for the network in `NEXT_PUBLIC_STELLAR_NETWORK`,
 * and API calls go wherever `NEXT_PUBLIC_API_URL` points — the fixture
 * intercepts `**\/api/**` on any local origin — so the spec runs unchanged
 * against `next dev` locally and the production build in CI.
 *
 * The bearer token is memory-only, so after `signIn` every step navigates by
 * clicking, never with `page.goto`.
 */

const TREASURY_ACCOUNT = "GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG";
const TEST_ANCHOR = {
  name: "Testnet Anchor",
  homeDomain: "testanchor.stellar.org",
  assets: [
    { code: "USDC", issuer: USDC_ISSUER },
    { code: "XLM", issuer: null },
  ],
};

function seedTreasury(api: FakeMergePayApi) {
  return api.seedTreasuryGroup("Flat treasury", {
    publicKey: TREASURY_ACCOUNT,
    requiredSigners: 2,
    balances: [
      { assetCode: "XLM", assetIssuer: null, balance: "250.0000000" },
      { assetCode: "USDC", assetIssuer: USDC_ISSUER, balance: "40.5000000" },
    ],
  });
}

/**
 * Open a group from the dashboard by its card's "Open" button. The group page
 * keeps list filters in the query string, so only the path is matched.
 */
async function openGroupFromDashboard(page: Page, groupId: string, groupName: string) {
  await expect(page.getByText(groupName)).toBeVisible();
  await page.getByRole("button", { name: /^open/i }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}(\\?[^#]*)?$`));
}

test.describe("treasury mode and SEP-24 anchor deposit", () => {
  test("navigates to a treasury group, then starts an anchor deposit from the dashboard", async ({
    page,
    api,
  }) => {
    const group = seedTreasury(api);
    api.anchors = [TEST_ANCHOR];

    await signIn(page);

    // --- Treasury Mode ------------------------------------------------------
    await openGroupFromDashboard(page, group.id, group.name);
    await expect(page.getByTestId("group-title")).toHaveText("Flat treasury");

    const treasury = page.getByTestId("treasury-view");
    await expect(treasury).toBeVisible();
    await expect(treasury.getByText("Treasury mode", { exact: true })).toBeVisible();
    await expect(treasury.getByText(/2-signer approval/i)).toBeVisible();
    // Both settlement assets are trusted by the treasury account.
    await expect(treasury.getByText(/XLM ready/i)).toBeVisible();
    await expect(treasury.getByText(/USDC ready/i)).toBeVisible();
    // Each asset keeps its own breakdown row.
    await expect(treasury.getByRole("progressbar", { name: /XLM share of treasury/i })).toBeVisible();
    await expect(treasury.getByRole("progressbar", { name: /USDC share of treasury/i })).toBeVisible();
    expect(api.callsTo("GET", `/api/groups/${group.id}/treasury`).length).toBeGreaterThan(0);

    // Refresh re-reads the treasury through the shared query cache.
    const before = api.callsTo("GET", `/api/groups/${group.id}/treasury`).length;
    await treasury.getByRole("button", { name: /refresh treasury balances/i }).click();
    await expect
      .poll(() => api.callsTo("GET", `/api/groups/${group.id}/treasury`).length)
      .toBeGreaterThan(before);

    // --- Anchor deposit -----------------------------------------------------
    await page.getByRole("link", { name: /back to dashboard/i }).click();
    await expect(page).toHaveURL(/\/dashboard(\?[^#]*)?$/);
    await page.getByRole("button", { name: /add money/i }).click();

    const modal = page.getByRole("dialog", { name: /^deposit (xlm|usdc)$/i });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("button", { name: /^deposit/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await modal.getByRole("button", { name: "USDC", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /^deposit usdc$/i })).toBeVisible();

    // The only anchor that supports USDC is picked automatically.
    const anchorOption = modal.getByRole("button", { name: new RegExp(TEST_ANCHOR.name) });
    await expect(anchorOption).toHaveAttribute("aria-pressed", "true");

    await modal.getByRole("button", { name: /start deposit/i }).click();

    // The wallet signs the SEP-10 challenge; the modal then embeds the
    // anchor's interactive page.
    const interactive = page.getByRole("dialog", { name: /complete deposit/i });
    await expect(interactive).toBeVisible();
    await expect(interactive.getByText(/pending user transfer start/i)).toBeVisible();
    const frame = interactive.locator('iframe[title="SEP-24 interactive transfer"]');
    await expect(frame).toHaveAttribute(
      "src",
      new RegExp(`^https://${TEST_ANCHOR.homeDomain.replace(/\./g, "\\.")}/sep24/interactive`)
    );

    const [start] = api.callsTo("POST", "/api/anchors/deposit");
    expect(start.body).toMatchObject({ assetCode: "USDC", anchorName: TEST_ANCHOR.name });
    expect(api.callsTo("POST", "/api/anchors/sessions/anchor-session-1/complete")).toHaveLength(1);

    await interactive.getByRole("button", { name: /^close$/i }).last().click();
    await expect(interactive).toBeHidden();
  });

  test("anchor modal recovers when the anchor catalogue fails to load", async ({ page, api }) => {
    api.anchors = [TEST_ANCHOR];
    // A 4xx fails fast (no retry backoff, #900), so the error state is immediate.
    api.failNext("GET", "/api/anchors", 404, { error: "not_found" });

    await signIn(page);
    await page.getByRole("button", { name: /add money/i }).click();

    const modal = page.getByRole("dialog", { name: /^deposit/i });
    await expect(modal).toBeVisible();
    const alert = modal.getByRole("alert").filter({ hasText: /could not load anchor information/i });
    await expect(alert).toBeVisible();

    await alert.getByRole("button", { name: /retry/i }).click();
    await expect(alert).toBeHidden();
    await expect(modal.getByRole("button", { name: new RegExp(TEST_ANCHOR.name) })).toBeVisible();
  });

  test("withdraw opens the same modal on the withdrawal direction", async ({ page, api }) => {
    api.anchors = [TEST_ANCHOR];
    await signIn(page);

    await page.getByRole("button", { name: /^withdraw$/i }).click();
    const modal = page.getByRole("dialog", { name: /^withdraw/i });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("button", { name: /^withdraw/i }).first()).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await modal.getByRole("button", { name: /^close$/i }).last().click();
    await expect(modal).toBeHidden();
  });
});
