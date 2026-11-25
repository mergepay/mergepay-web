import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  // Locally the suite runs against `next dev`, which compiles routes on
  // demand, so a client-side navigation can take several seconds on a cold or
  // modest machine. CI serves a production build and keeps the defaults.
  timeout: isCI ? 30_000 : 90_000,
  expect: { timeout: isCI ? 5_000 : 15_000 },
  // Never block the run serving the report — open it with `npx playwright show-report`.
  reporter: isCI
    ? [["list"], ["html", { open: "never" }]]
    : [["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Fail a click on a missing element in seconds rather than at the test
    // timeout, so one stuck locator can't use up the CI step's time budget.
    actionTimeout: isCI ? 10_000 : 0,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // CI serves the production build from the workflow's `npm run build`
    // step: `next dev` compiles each route on first visit, which is what
    // pushes cold runs past the test timeout. Run `npm run build` first to
    // reproduce CI locally, with the same `NEXT_PUBLIC_*` env as the specs.
    command: isCI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !isCI,
    // A cold `next dev` boot plus first compile of `/` takes minutes on
    // modest hardware; `next start` is ready in seconds.
    timeout: (isCI ? 120 : 300) * 1000,
  },
});
