import { describe, expect, it } from "vitest";
import { resolveSocketUrl } from "../../../src/features/terminal/bootstrap/url/socket-url-resolution";
import { TERMINAL_BACKEND_ROUTE } from "../../../src/features/terminal/protocol/generated-wire-contract";

function createWindow(
  protocol: "http:" | "https:",
  host: string,
): Window | null {
  return {
    location: {
      protocol,
      host,
    },
  } as Window;
}

describe("socket url resolution", () => {
  it("converts http env urls to websocket urls anchored to terminal route", () => {
    const backendHost = "api.example.test";
    const backendPath = "/custom/base";
    const httpsBackendUrl = `https://${backendHost}${backendPath}`;
    const resolution = resolveSocketUrl(
      createWindow("https:", "app.example.test"),
      httpsBackendUrl,
    );

    expect(resolution).toEqual({
      ok: true,
      socketUrl: `wss://${backendHost}${backendPath}${TERMINAL_BACKEND_ROUTE.TERMINAL_WS}`,
    });
  });

  it("maps sessions HTTP path env urls to terminal websocket path", () => {
    const backendHost = "api.example.test";
    const sessionsUrl = `https://${backendHost}${TERMINAL_BACKEND_ROUTE.SESSIONS_HTTP}`;
    const resolution = resolveSocketUrl(
      createWindow("https:", "app.example.test"),
      sessionsUrl,
    );

    expect(resolution).toEqual({
      ok: true,
      socketUrl: `wss://${backendHost}${TERMINAL_BACKEND_ROUTE.TERMINAL_WS}`,
    });
  });

  it("normalizes relative sessions env paths to terminal websocket path", () => {
    const resolution = resolveSocketUrl(
      createWindow("https:", "app.example.test"),
      TERMINAL_BACKEND_ROUTE.SESSIONS_HTTP,
    );

    expect(resolution).toEqual({
      ok: true,
      socketUrl: `wss://app.example.test${TERMINAL_BACKEND_ROUTE.TERMINAL_WS}`,
    });
  });

  it("falls back to generated default route when env url is blank", () => {
    const resolution = resolveSocketUrl(
      createWindow("https:", "app.example.test"),
      "   ",
    );

    expect(resolution).toEqual({
      ok: true,
      socketUrl: `wss://app.example.test${TERMINAL_BACKEND_ROUTE.TERMINAL_WS}`,
    });
  });

  it("maps root-relative env path to terminal websocket route", () => {
    const resolution = resolveSocketUrl(
      createWindow("https:", "app.example.test"),
      "/",
    );

    expect(resolution).toEqual({
      ok: true,
      socketUrl: `wss://app.example.test${TERMINAL_BACKEND_ROUTE.TERMINAL_WS}`,
    });
  });

  it("returns unsupported protocol issue for invalid env protocol", () => {
    const backendHost = "api.example.test";
    const ftpSocketUrl = `ftp://${backendHost}/socket`;
    const resolution = resolveSocketUrl(
      createWindow("https:", "app.example.test"),
      ftpSocketUrl,
    );

    expect(resolution).toEqual({
      ok: false,
      issue: {
        code: "env_socket_url_unsupported_protocol",
        details: `VITE_WOOTTY_WS_URL uses an unsupported protocol: ${ftpSocketUrl}`,
      },
    });
  });

  it("returns invalid format issue for malformed websocket env URL", () => {
    const malformedSocketUrl = "ws://[::1";
    const resolution = resolveSocketUrl(
      createWindow("https:", "app.example.test"),
      malformedSocketUrl,
    );

    expect(resolution).toEqual({
      ok: false,
      issue: {
        code: "env_socket_url_invalid_format",
        details: `VITE_WOOTTY_WS_URL is not a valid URL: ${malformedSocketUrl}`,
      },
    });
  });
});
