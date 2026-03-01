import { describe, expect, it } from "vitest";
import { resolveTerminalBackendEndpoints } from "../../../src/features/terminal/bootstrap/backend-endpoint-resolver";

const HTTPS_PROTOCOL = "https:";
const HTTP_PROTOCOL = "http:";
const WS_PROTOCOL = "ws:";
const WSS_PROTOCOL = "wss:";
const APP_HOST = "app.example.test";
const WS_HOST = "ws.example.test";
const LOOPBACK_HOST = "127.0.0.1";

function createWindowLikeRef(url: string): Window {
  const parsed = new URL(url);
  return {
    location: {
      protocol: parsed.protocol,
      host: parsed.host,
    },
  } as Window;
}

describe("terminal environment backend endpoint resolution", () => {
  it("derives HTTP sessions endpoint from configured websocket endpoint", () => {
    const appWindowUrl = `${HTTPS_PROTOCOL}//${APP_HOST}`;
    const configuredSocketUrl = `${WSS_PROTOCOL}//${WS_HOST}/api/terminal`;
    const resolved = resolveTerminalBackendEndpoints(
      createWindowLikeRef(appWindowUrl),
      configuredSocketUrl,
    );

    expect(resolved).toEqual({
      ok: true,
      endpoints: {
        terminalWsUrl: configuredSocketUrl,
        sessionsHttpUrl: `${HTTPS_PROTOCOL}//${WS_HOST}/api/sessions`,
      },
    });
  });

  it("returns a bootstrap issue when websocket config is invalid", () => {
    const resolved = resolveTerminalBackendEndpoints(
      null,
      "ftp://invalid-url?token=token-123",
      "token-123",
    );

    expect(resolved.ok).toBe(false);
    expect(resolved).toMatchObject({
      ok: false,
      issue: {
        code: "env_socket_url_unsupported_protocol",
      },
    });
    expect(
      (resolved as { issue: { details: string } }).issue.details,
    ).not.toContain("token-123");
    expect(
      (resolved as { issue: { details: string } }).issue.details,
    ).toContain("redacted");
  });

  it("injects auth token into websocket endpoint query when configured", () => {
    const resolved = resolveTerminalBackendEndpoints(
      createWindowLikeRef(`${HTTPS_PROTOCOL}//${APP_HOST}`),
      `${WSS_PROTOCOL}//${WS_HOST}/api/terminal`,
      "secret-token",
    );

    expect(resolved).toEqual({
      ok: true,
      endpoints: {
        terminalWsUrl: `${WSS_PROTOCOL}//${WS_HOST}/api/terminal?token=secret-token`,
        sessionsHttpUrl: `${HTTPS_PROTOCOL}//${WS_HOST}/api/sessions`,
      },
    });
  });

  it("returns typed issue when auth token injection receives malformed websocket URL", () => {
    const resolved = resolveTerminalBackendEndpoints(
      createWindowLikeRef(`${HTTPS_PROTOCOL}//${APP_HOST}`),
      "ws://[::1",
      "secret-token",
    );

    expect(resolved).toMatchObject({
      ok: false,
      issue: {
        code: "env_socket_url_invalid_format",
      },
    });
  });

  it("retains token already present in configured websocket URL", () => {
    const configuredSocketUrl = `${WSS_PROTOCOL}//${WS_HOST}/api/terminal?token=config-token`;
    const resolved = resolveTerminalBackendEndpoints(
      createWindowLikeRef(`${HTTPS_PROTOCOL}//${APP_HOST}`),
      configuredSocketUrl,
    );

    expect(resolved).toEqual({
      ok: true,
      endpoints: {
        terminalWsUrl: configuredSocketUrl,
        sessionsHttpUrl: `${HTTPS_PROTOCOL}//${WS_HOST}/api/sessions`,
      },
    });
  });

  it("covers endpoint normalization branches for http(s), relative, and default sources", () => {
    const httpsWindow = createWindowLikeRef(`${HTTPS_PROTOCOL}//${APP_HOST}`);
    const httpWindow = createWindowLikeRef(`${HTTP_PROTOCOL}//${APP_HOST}`);

    const cases = [
      {
        label: "https endpoint to wss",
        windowRef: httpsWindow,
        envSocketUrl: `${HTTPS_PROTOCOL}//${WS_HOST}/api/terminal`,
        expectedWsUrl: `${WSS_PROTOCOL}//${WS_HOST}/api/terminal`,
        expectedSessionsUrl: `${HTTPS_PROTOCOL}//${WS_HOST}/api/sessions`,
      },
      {
        label: "http endpoint to ws",
        windowRef: httpWindow,
        envSocketUrl: `${HTTP_PROTOCOL}//${WS_HOST}/api/terminal`,
        expectedWsUrl: `${WS_PROTOCOL}//${WS_HOST}/api/terminal`,
        expectedSessionsUrl: `${HTTP_PROTOCOL}//${WS_HOST}/api/sessions`,
      },
      {
        label: "relative endpoint uses window host",
        windowRef: httpsWindow,
        envSocketUrl: "/api/terminal",
        expectedWsUrl: `wss://${APP_HOST}/api/terminal`,
        expectedSessionsUrl: `${HTTPS_PROTOCOL}//${APP_HOST}/api/sessions`,
      },
      {
        label: "window-null default endpoint",
        windowRef: null,
        envSocketUrl: undefined,
        expectedWsUrl: `${WS_PROTOCOL}//${LOOPBACK_HOST}/api/terminal`,
        expectedSessionsUrl: `${HTTP_PROTOCOL}//${LOOPBACK_HOST}/api/sessions`,
      },
      {
        label: "pathful websocket override keeps prefix for sessions endpoint",
        windowRef: httpsWindow,
        envSocketUrl: `${WSS_PROTOCOL}//${WS_HOST}/tenant-a/api/terminal`,
        expectedWsUrl: `${WSS_PROTOCOL}//${WS_HOST}/tenant-a/api/terminal`,
        expectedSessionsUrl: `${HTTPS_PROTOCOL}//${WS_HOST}/tenant-a/api/sessions`,
      },
    ] as const;

    for (const testCase of cases) {
      const resolved = resolveTerminalBackendEndpoints(
        testCase.windowRef,
        testCase.envSocketUrl,
      );
      expect(resolved, testCase.label).toEqual({
        ok: true,
        endpoints: {
          terminalWsUrl: testCase.expectedWsUrl,
          sessionsHttpUrl: testCase.expectedSessionsUrl,
        },
      });
    }
  });
});
