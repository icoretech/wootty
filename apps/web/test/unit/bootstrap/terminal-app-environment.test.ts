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

function buildCurrentHostSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/terminal`;
}

function buildCurrentHostSessionsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${window.location.host}/api/sessions`;
}

describe("terminal app environment factory", () => {
  it("uses an injected websocket endpoint instead of import-time env capture", () => {
    const host = "override.example.test";
    const socketUrl = buildSocketUrl(host);
    const environment = createTerminalAppEnvironment({
      socketUrl,
    });

    const resolution = environment.resolveBackendEndpoints(window);
    expect(resolution).toEqual({
      ok: true,
      endpoints: {
        terminalWsUrl: socketUrl,
        sessionsHttpUrl: buildSessionsUrl(host),
      },
    });
  });

  it("falls back to host-derived backend endpoints when injected socket url is blank", () => {
    const environment = createTerminalAppEnvironment({
      socketUrl: "   ",
    });

    const resolution = environment.resolveBackendEndpoints(window);
    expect(resolution).toEqual({
      ok: true,
      endpoints: {
        terminalWsUrl: buildCurrentHostSocketUrl(),
        sessionsHttpUrl: buildCurrentHostSessionsUrl(),
      },
    });
  });
});
