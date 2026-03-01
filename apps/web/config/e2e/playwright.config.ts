import { defineConfig, devices } from "@playwright/test";
import { resolveE2eRuntime } from "./e2e-env";

const e2eConfig = resolveE2eRuntime(process.env);

export default defineConfig({
  testDir: "../../e2e",
  timeout: 45_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: e2eConfig.baseURL,
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
    ...(e2eConfig.crossBrowser
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
    command: e2eConfig.webServer.command,
    cwd: e2eConfig.webServer.cwd,
    env: {
      ...process.env,
      ...e2eConfig.webServer.env,
    },
    url: e2eConfig.healthUrl,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
