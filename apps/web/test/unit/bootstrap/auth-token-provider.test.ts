import { afterEach, describe, expect, it } from "vitest";
import {
  createBrowserAuthTokenProvider,
  normalizeAuthToken,
  readAuthTokenFromUrl,
  readAuthTokenFromUrlResult,
  readAuthTokenFromWindow,
} from "../../../src/features/terminal/bootstrap/auth-token-provider";

describe("auth token provider", () => {
  const originalPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  afterEach(() => {
    window.history.replaceState({}, "", originalPath);
  });

  it("normalizes and parses token sources", () => {
    expect(normalizeAuthToken("  token  ")).toBe("token");
    expect(normalizeAuthToken("   ")).toBeUndefined();
    expect(readAuthTokenFromUrl("wss://host/api/terminal?token=abc")).toBe(
      "abc",
    );
    expect(readAuthTokenFromUrl("not-a-url")).toBeUndefined();
    expect(readAuthTokenFromUrlResult("not-a-url")).toMatchObject({
      token: undefined,
      issue: {
        code: "socket_url_invalid_format",
      },
    });
  });

  it("prefers window query token, then configured endpoint token fallback", () => {
    window.history.replaceState({}, "", "/?token=win");
    expect(readAuthTokenFromWindow(window)).toBe("win");

    const fromWindow = createBrowserAuthTokenProvider(
      "wss://ws.example.test/api/terminal?token=env",
    );
    expect(fromWindow().token).toBe("win");

    window.history.replaceState({}, "", "/");
    const fromFallback = createBrowserAuthTokenProvider(
      "wss://ws.example.test/api/terminal?token=env",
    );
    expect(fromFallback().token).toBe("env");
  });

  it("returns no token when configured endpoint protocol is unsupported", () => {
    window.history.replaceState({}, "", "/");
    const provider = createBrowserAuthTokenProvider("ftp://ws.example.test");
    const resolution = provider();
    expect(resolution.token).toBeUndefined();
    expect(resolution.issue?.code).toBe("env_socket_url_unsupported_protocol");
  });

  it("surfaces typed issue when configured websocket URL is malformed", () => {
    window.history.replaceState({}, "", "/");
    const provider = createBrowserAuthTokenProvider("ws://[::1");
    const resolution = provider();

    expect(resolution.token).toBeUndefined();
    expect(resolution.issue?.code).toBe("socket_url_invalid_format");
  });
});
