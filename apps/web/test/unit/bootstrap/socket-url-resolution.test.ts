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
    const resolution = resolveSocketUrl(
      createWindow("https:", "app.example.test"),
      "https://api.example.test/custom/terminal",
    );

    expect(resolution).toEqual({
      ok: true,
      socketUrl: "wss://api.example.test/custom/terminal",
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
    const resolution = resolveSocketUrl(
      createWindow("https:", "app.example.test"),
      "ftp://api.example.test/socket",
    );

    expect(resolution).toEqual({
      ok: false,
      issue: {
        code: "env_socket_url_unsupported_protocol",
        details:
          "VITE_WOOTTY_WS_URL uses an unsupported protocol: ftp://api.example.test/socket",
      },
    });
  });
});
