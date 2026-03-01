import { describe, expect, it } from "vitest";
import { createTerminalAppEnvironment } from "../../../src/features/terminal/bootstrap/terminal-environment";

function buildSocketUrl(host: string): string {
  const url = new URL(window.location.href);
  url.protocol = "wss:";
  url.host = host;
  url.pathname = "/api/terminal";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function buildSessionsUrl(host: string): string {
  const url = new URL(window.location.href);
  url.protocol = "https:";
  url.host = host;
  url.pathname = "/api/sessions";
  url.search = "";
  url.hash = "";
  return url.toString();
}

describe("terminal app environment factory", () => {
  it("uses an injected websocket endpoint instead of import-time env capture", () => {
    const host = "override.example.test";
    const socketUrl = buildSocketUrl(host);
    const environment = createTerminalAppEnvironment({
      socketUrl,
    });

    const resolution = environment.platform.resolveBackendEndpoints(window);
    expect(resolution).toEqual({
      ok: true,
      endpoints: {
        terminalWsUrl: socketUrl,
        sessionsHttpUrl: buildSessionsUrl(host),
      },
    });
  });
});
