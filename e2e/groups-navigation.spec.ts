import type { Page } from "@playwright/test";
import { expect, signIn, test } from "./fixtures/mergepay";

/**
 * Group creation, dashboard navigation and the groups pages' basic
 * interactions (#723).
 *
 * Every test signs in through the mocked wallet and talks only to the
 * per-test fake in `fixtures/mergepay.ts`, so tests share no state and need
 * no backend. After sign-in everything navigates client-side: the session
 * token is memory-only, and a full page load would drop it.
 */

const GROUP_NAME = "Lagos Trip 2026";
const GROUP_DESCRIPTION = "Flights, food and the boat to Tarkwa Bay";

/** The sidebar is the desktop navigation; the Desktop Chrome viewport shows it. */
function sidebar(page: Page) {
  return page.locator("aside");
}

async function openGroupsPage(page: Page): Promise<void> {
  await sidebar(page).getByRole("link", { name: "Groups" }).click();
  await expect(page).toHaveURL(/\/groups$/);
  await expect(page.getByRole("heading", { name: "Your Groups" })).toBeVisible();
}

async function openCreateDialog(page: Page) {
  await page.getByTestId("groups-create").click();
  const dialog = page.getByRole("dialog", { name: "New group" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("dashboard navigation", () => {
  test("sidebar links lead to each section and back to the dashboard", async ({
    page,
  }) => {
    await signIn(page);
    await expect(page.getByText(`Welcome back, Alice Stellar`)).toBeVisible();

    const sections = [
      { link: "Groups", url: /\/groups$/, heading: "Your Groups" },
      { link: "Anchors", url: /\/anchors$/, heading: "Anchors" },
      { link: "History", url: /\/history$/, heading: "History" },
      { link: "Settings", url: /\/settings$/, heading: "Settings" },
      { link: "Dashboard", url: /\/dashboard$/, heading: "Dashboard" },
    ];
    for (const { link, url, heading } of sections) {
      await sidebar(page).getByRole("link", { name: link, exact: true }).click();
      await expect(page).toHaveURL(url);
      await expect(
        page.getByRole("heading", { level: 1, name: heading, exact: true })
      ).toBeVisible();
    }
  });

  test("opens a group from the dashboard and returns with the back button", async ({
    page,
    api,
  }) => {
    const group = api.seedGroup(GROUP_NAME, GROUP_DESCRIPTION);
    await signIn(page);

    await expect(page.getByText(GROUP_NAME)).toBeVisible();
    await expect(page.getByText(GROUP_DESCRIPTION)).toBeVisible();
    await page.getByRole("button", { name: /^open/i }).click();

    await expect(page).toHaveURL(new RegExp(`/groups/${group.id}(\\?[^#]*)?$`));
    await expect(page.getByTestId("group-title")).toHaveText(GROUP_NAME);
    await expect(page.getByText(/no expenses yet/i)).toBeVisible();

    await page.getByRole("button", { name: /back to dashboard/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });
});

test.describe("group creation", () => {
  test("creates a group and lists it afterwards", async ({ page, api }) => {
    await signIn(page);
    await openGroupsPage(page);
    await expect(page.getByText("No groups yet")).toBeVisible();

    const dialog = await openCreateDialog(page);
    await dialog.getByLabel("Group name").fill(GROUP_NAME);
    await dialog.getByLabel("Description (optional)").fill(GROUP_DESCRIPTION);

    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/groups") &&
        response.request().method() === "POST"
    );
    await dialog.getByRole("button", { name: "Create group" }).click();
    expect((await created).status()).toBe(201);

    // What the user typed is exactly what reached the API.
    expect(api.callsTo("POST", "/api/groups").map((call) => call.body)).toEqual([
      { name: GROUP_NAME, description: GROUP_DESCRIPTION },
    ]);

    await expect(page.getByText("Group created", { exact: true })).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/groups\/grp-e2e-1(\?[^#]*)?$/);
    await expect(page.getByTestId("group-title")).toHaveText(GROUP_NAME);
    await expect(page.getByText(GROUP_DESCRIPTION)).toBeVisible();

    // The list refetches after the mutation and now shows the new group.
    await openGroupsPage(page);
    const card = page.getByTestId("group-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(GROUP_NAME);
    await expect(card).toContainText(GROUP_DESCRIPTION);
    await expect(card).toContainText("1 member");
  });

  test("blocks invalid names with inline errors and sends nothing", async ({
    page,
    api,
  }) => {
    await signIn(page);
    await openGroupsPage(page);
    const dialog = await openCreateDialog(page);
    const name = dialog.getByLabel("Group name");
    const submit = dialog.getByRole("button", { name: "Create group" });

    // Empty submit.
    await submit.click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Group name must be at least 2 characters"
    );
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByText("Please fix the errors before submitting")
    ).toBeVisible();

    // Whitespace is trimmed, so one visible character is still too short.
    await name.fill("  A  ");
    await submit.click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Group name must be at least 2 characters"
    );
    await expect(dialog).toBeVisible();
    expect(api.callsTo("POST", "/api/groups")).toEqual([]);

    // Fixing the name clears the error on blur and lets the form submit.
    await name.fill(GROUP_NAME);
    await name.blur();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect(name).not.toHaveAttribute("aria-invalid", "true");
    await submit.click();
    await expect(page.getByTestId("group-title")).toHaveText(GROUP_NAME);
    // The empty optional description is not sent.
    expect(api.callsTo("POST", "/api/groups").map((call) => call.body)).toEqual([
      { name: GROUP_NAME },
    ]);
  });

  test("shows the API error and keeps the form usable", async ({ page, api }) => {
    api.failNext("POST", "/api/groups", 500, {
      error: "Group service is temporarily unavailable",
      code: "internal_error",
    });
    await signIn(page);
    await openGroupsPage(page);

    const dialog = await openCreateDialog(page);
    await dialog.getByLabel("Group name").fill(GROUP_NAME);
    const submit = dialog.getByRole("button", { name: "Create group" });
    await submit.click();

    await expect(
      page.getByText("Group service is temporarily unavailable")
    ).toBeVisible();
    // Still open, still holding what the user typed, still submittable.
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Group name")).toHaveValue(GROUP_NAME);
    await expect(submit).toBeEnabled();
    await expect(page).toHaveURL(/\/groups$/);

    // A retry goes through.
    await submit.click();
    await expect(page.getByTestId("group-title")).toHaveText(GROUP_NAME);
    expect(api.callsTo("POST", "/api/groups")).toHaveLength(2);
  });
});

test.describe("groups page interactions", () => {
  test("the create dialog closes by Cancel, Escape and its close button without sending", async ({
    page,
    api,
  }) => {
    await signIn(page);
    await openGroupsPage(page);

    let dialog = await openCreateDialog(page);
    await dialog.getByLabel("Group name").fill("Never sent");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    dialog = await openCreateDialog(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    dialog = await openCreateDialog(page);
    await dialog.getByRole("button", { name: "Close New group" }).click();
    await expect(dialog).toBeHidden();

    // The empty state's own button opens the same dialog.
    await page.getByRole("button", { name: "Create group" }).click();
    await expect(page.getByRole("dialog", { name: "New group" })).toBeVisible();
    await page.keyboard.press("Escape");

    expect(api.callsTo("POST", "/api/groups")).toEqual([]);
    await expect(page.getByText("No groups yet")).toBeVisible();
  });

  test("the join dialog opens and closes", async ({ page }) => {
    await signIn(page);
    await openGroupsPage(page);

    await page.getByRole("button", { name: "Join group" }).click();
    const dialog = page.getByRole("dialog", { name: "Join a group" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Invite code")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("opens a group from the list", async ({ page, api }) => {
    api.seedGroup("Flatmates", "Rent and utilities");
    const target = api.seedGroup(GROUP_NAME, GROUP_DESCRIPTION);
    await signIn(page);
    await openGroupsPage(page);

    await expect(page.getByTestId("group-card")).toHaveCount(2);
    await page
      .getByTestId("group-card")
      .filter({ hasText: GROUP_NAME })
      .click();

    await expect(page).toHaveURL(new RegExp(`/groups/${target.id}(\\?[^#]*)?$`));
    await expect(page.getByTestId("group-title")).toHaveText(GROUP_NAME);
    await expect(
      page.getByRole("button", { name: /add expense/i })
    ).toBeVisible();
  });
});

