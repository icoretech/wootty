import { defineConfig, devices } from "@playwright/test";

const port = process.env.WOOTTY_E2E_PORT ?? "4310";
const baseURL = `http://127.0.0.1:${port}`;
const crossBrowser = process.env.WOOTTY_E2E_CROSS === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
    ...(crossBrowser
      ? [
          {
            name: "firefox",
            use: { ...devices["Desktop Firefox"] },
          },
          {
            name: "webkit",
            use: { ...devices["Desktop Safari"] },
          },
        ]
      : []),
  ],
  webServer: {
    command: `WOOTTY_PORT=${port} WOOTTY_FAKE_PTY=1 node ../server/dist/cli.js run -p ${port} sh`,
    url: `${baseURL}/api/health`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
