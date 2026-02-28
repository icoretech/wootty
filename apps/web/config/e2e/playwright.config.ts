import { defineConfig, devices } from "@playwright/test";
import {
  buildE2eConfig,
  buildE2eServerCommand,
  resolveE2ePort,
} from "./e2e-env";

const port = resolveE2ePort(process.env.WOOTTY_E2E_PORT);
const e2eConfig = buildE2eConfig(port);
const crossBrowser = process.env.WOOTTY_E2E_CROSS === "1";

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
    command: buildE2eServerCommand(e2eConfig.port),
    url: e2eConfig.healthUrl,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
