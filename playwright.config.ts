import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 6_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5181",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command:
      "corepack pnpm exec cross-env DATABASE_PATH=.tmp/e2e/data/app.db WORKSPACE_PATH=.tmp/e2e/workspace EXPORTS_PATH=.tmp/e2e/exports SERVER_PORT=3011 WEB_PORT=5181 corepack pnpm dev",
    url: "http://127.0.0.1:5181/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
