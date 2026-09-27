import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke coverage for the public shell and the unauthenticated edge of the app
 * (#485).
 *
 * These run against the real dev server with no wallet extension and no
 * session, which is exactly the state a first-time visitor arrives in: the
 * landing page has to render its neobrutalist chrome and navigation, the
 * stored theme has to reach the document, and a protected view has to hand a
 * visitor without a session to the sign-in screen rather than a shell whose
 * every API call 401s.
 */

/** Collects uncaught exceptions (including rejected promises) on `page`. */
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("landing page", () => {
  test("renders the neobrutalist header and hero without runtime errors", async ({
    page,
  }) => {
    const pageErrors = trackPageErrors(page);

    await page.goto("/");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /mergepay/i
    );

    // The sticky header is the first thing that identifies the site as ours:
    // an ink rule under a paper-coloured bar, never a hairline border.
    const header = page.locator("header").first();
    await expect(header).toBeVisible();
    await expect(header).toHaveClass(/border-b-3/);
    await expect(header).toHaveClass(/border-ink/);
    await expect(header.locator("nav")).toBeVisible();

    expect(pageErrors, `uncaught errors on "/":\n${pageErrors.join("\n")}`).toEqual(
      []
    );
  });

  test("links every section nav item and the launch action", async ({ page }) => {
    await page.goto("/");

    const nav = page.locator("header nav");
    await expect(nav.getByRole("link", { name: "How it works" })).toHaveAttribute(
      "href",
      "#how"
    );
    await expect(nav.getByRole("link", { name: "Features" })).toHaveAttribute(
      "href",
      "#features"
    );
    await expect(nav.getByRole("link", { name: "Stellar" })).toHaveAttribute(
      "href",
      "#stellar"
    );
    await expect(nav.getByRole("link", { name: /repo/i })).toHaveAttribute(
      "href",
      /github\.com\/mergepay\/mergepay-web/
    );

    await page.locator('header a[href="/login"]').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /connect freighter/i })
    ).toBeVisible();
  });
});

test.describe("theme rendering", () => {
  test("applies the resolved theme class to the document", async ({ page }) => {
    // Playwright emulates a light OS preference, so a visitor with no stored
    // choice lands on the light theme…
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/\blight\b/);
    await expect(page.locator("header").first()).toBeVisible();

    // …and an explicit choice overrides it on the next load.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("mergepay-theme", "dark");
      } catch {
        // storage disabled — the page falls back to the system theme
      }
    });
    await page.reload();

    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect(page.locator("header").first()).toBeVisible();
  });
});

test.describe("route guarding", () => {
  test("sends a visitor without a session to the sign-in screen", async ({
    page,
  }) => {
    // Both deep links land in the account-scoped route group, so both must
    // bounce instead of rendering a shell with no session behind it.
    for (const path of ["/dashboard", "/history"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
      await expect(
        page.getByRole("button", { name: /connect freighter/i })
      ).toBeVisible();
    }
  });

  test("leaves the public pages reachable without a session", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    // The sign-in screen must not bounce a fresh visitor back to the home page.
    await expect(page).toHaveURL(/\/login$/);
  });
});
