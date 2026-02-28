import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildE2eConfig,
  buildE2eServerCommand,
  buildE2eServerLaunch,
  DEFAULT_E2E_PORT,
  resolveE2eBaseUrl,
  resolveE2ePort,
} from "../../config/e2e/e2e-env";
import staticPlaywrightConfig from "../../config/e2e/playwright.config";

type PlaywrightConfigModule = {
  default: {
    use: { baseURL: string };
    projects: Array<{ name: string }>;
    webServer: { command: string; url: string };
  };
};

const originalPort = process.env.WOOTTY_E2E_PORT;
const originalCross = process.env.WOOTTY_E2E_CROSS;

async function loadConfig(): Promise<PlaywrightConfigModule["default"]> {
  vi.resetModules();
  const module = (await import(
    "../../config/e2e/playwright.config"
  )) as PlaywrightConfigModule;
  return module.default;
}

afterEach(() => {
  process.env.WOOTTY_E2E_PORT = originalPort;
  process.env.WOOTTY_E2E_CROSS = originalCross;
});

describe("playwright config", () => {
  it("exports a statically importable config object", () => {
    expect(staticPlaywrightConfig.testDir).toBe("../../e2e");
    expect(staticPlaywrightConfig.projects.length).toBeGreaterThan(0);
  });

  it("uses the default local test server when env vars are unset", async () => {
    delete process.env.WOOTTY_E2E_PORT;
    delete process.env.WOOTTY_E2E_CROSS;

    const config = await loadConfig();
    const expected = buildE2eConfig(DEFAULT_E2E_PORT);

    expect(config.use.baseURL).toBe(expected.baseURL);
    expect(config.projects.map((project) => project.name)).toEqual([
      "chromium",
      "mobile-chromium",
    ]);
    expect(config.webServer.url).toBe(expected.healthUrl);
  });

  it("enables cross-browser projects when WOOTTY_E2E_CROSS is set", async () => {
    process.env.WOOTTY_E2E_PORT = "4999";
    process.env.WOOTTY_E2E_CROSS = "1";

    const config = await loadConfig();
    const expected = buildE2eConfig(4999);
    const launch = buildE2eServerLaunch(expected.port);

    expect(config.use.baseURL).toBe(expected.baseURL);
    expect(config.projects.map((project) => project.name)).toEqual([
      "chromium",
      "mobile-chromium",
      "firefox",
      "webkit",
    ]);
    expect(config.webServer.command).toContain(`cd ${launch.cwd}`);
    expect(config.webServer.command).toContain("WOOTTY_FAKE_PTY=1");
    expect(config.webServer.command).toContain(
      `WOOTTY_PORT=${launch.env.WOOTTY_PORT}`,
    );
    expect(config.webServer.command).toContain(`--port ${expected.port}`);
    expect(config.webServer.command).toContain("WOOTTY_FAKE_PTY=1");
    expect(buildE2eServerCommand(expected.port)).toContain(
      launch.args.join(" "),
    );
  });

  it("falls back to default port when env value is malformed", async () => {
    process.env.WOOTTY_E2E_PORT = "not-a-port";
    delete process.env.WOOTTY_E2E_CROSS;

    const config = await loadConfig();

    expect(resolveE2ePort("not-a-port")).toBe(DEFAULT_E2E_PORT);
    expect(config.use.baseURL).toBe(resolveE2eBaseUrl(DEFAULT_E2E_PORT));
  });

  it("falls back to default port when env value is out of range", async () => {
    process.env.WOOTTY_E2E_PORT = "70000";
    delete process.env.WOOTTY_E2E_CROSS;

    const config = await loadConfig();

    expect(resolveE2ePort("70000")).toBe(DEFAULT_E2E_PORT);
    expect(config.use.baseURL).toBe(resolveE2eBaseUrl(DEFAULT_E2E_PORT));
  });
});
