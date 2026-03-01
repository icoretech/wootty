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
  it("converts http env urls to websocket urls", () => {
    const backendHost = "api.example.test";
    const backendPath = "/custom/terminal";
    const httpsBackendUrl = `https://${backendHost}${backendPath}`;
    const resolution = resolveSocketUrl(
      createWindow("https:", "app.example.test"),
      httpsBackendUrl,
    );

    expect(resolution).toEqual({
      ok: true,
      socketUrl: `wss://${backendHost}${backendPath}`,
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
});
