import { afterEach, describe, expect, it, vi } from "vitest";

type PlaywrightConfigModule = {
  default: {
    use: { baseURL: string };
    projects: Array<{ name: string }>;
    webServer: { command: string; url: string };
  };
};

const loopbackHost = [127, 0, 0, 1].join(".");
const httpScheme = "http";

function buildBaseUrl(port: string): string {
  return `${httpScheme}://${loopbackHost}:${port}`;
}

const originalPort = process.env.WOOTTY_E2E_PORT;
const originalCross = process.env.WOOTTY_E2E_CROSS;

async function loadConfig(): Promise<PlaywrightConfigModule["default"]> {
  vi.resetModules();
  const module = (await import("../playwright.config")) as PlaywrightConfigModule;
  return module.default;
}

afterEach(() => {
  process.env.WOOTTY_E2E_PORT = originalPort;
  process.env.WOOTTY_E2E_CROSS = originalCross;
});

describe("playwright config", () => {
  it("uses the default local test server when env vars are unset", async () => {
    delete process.env.WOOTTY_E2E_PORT;
    delete process.env.WOOTTY_E2E_CROSS;

    const config = await loadConfig();

    expect(config.use.baseURL).toBe(buildBaseUrl("4310"));
    expect(config.projects.map((project) => project.name)).toEqual([
      "chromium",
      "mobile-chromium",
    ]);
    expect(config.webServer.url).toBe(`${buildBaseUrl("4310")}/api/health`);
  });

  it("enables cross-browser projects when WOOTTY_E2E_CROSS is set", async () => {
    process.env.WOOTTY_E2E_PORT = "4999";
    process.env.WOOTTY_E2E_CROSS = "1";

    const config = await loadConfig();

    expect(config.use.baseURL).toBe(buildBaseUrl("4999"));
    expect(config.projects.map((project) => project.name)).toEqual([
      "chromium",
      "mobile-chromium",
      "firefox",
      "webkit",
    ]);
    expect(config.webServer.command).toContain("WOOTTY_PORT=4999");
  });
});
