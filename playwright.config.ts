import { defineConfig, devices } from "@playwright/test";

const CI = Boolean(process.env.CI);

/**
 * End-to-end tests drive real browsers against the real server and web app.
 * Locally they reuse `npm run dev` if it is running; in CI they start the
 * production builds. PW_CHANNEL=chrome uses an installed Chrome instead of
 * Playwright's own Chromium.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: CI ? 1 : 0,
  // The Next dev server aborts some navigations while it compiles pages for
  // many browsers at once; production builds take far more, but two is enough.
  workers: 2,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  // In development the first visit to a page compiles it, which can take seconds.
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3001",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL },
    },
  ],
  webServer: [
    {
      command: "npm run start -w @retro/server",
      url: "http://127.0.0.1:4000/health",
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: "npm run start -w @retro/web",
      url: "http://localhost:3001/en",
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
