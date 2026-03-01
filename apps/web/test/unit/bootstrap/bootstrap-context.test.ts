import { describe, expect, it } from "vitest";
import {
  normalizeAuthToken,
  readAuthTokenFromUrlResult,
  readAuthTokenFromWindow,
  resolveBrowserAuthToken,
  resolveBrowserBackendEndpoints,
} from "../../../src/features/terminal/bootstrap/resolution/bootstrap-context";

const APP_URL_WITH_TOKEN = "https://app.example/?token=win";
const APP_URL_NO_TOKEN = "https://app.example/";
const SOCKET_URL_WITH_TOKEN = "wss://ws.example/api/terminal?token=env";
const INVALID_SOCKET_URL = "ftp://ws.example";
const TOKEN_URL_FOR_PARSE = "wss://host.example/api/terminal?token=abc";

function createWindowLike(url: string): Window {
  const parsed = new URL(url);
  return {
    location: {
      search: parsed.search,
      host: parsed.host,
      protocol: parsed.protocol as "http:" | "https:",
    },
  } as Window;
}

describe("bootstrap context", () => {
  it("normalizes and parses auth token sources", () => {
    expect(normalizeAuthToken("  token  ")).toBe("token");
    expect(normalizeAuthToken("   ")).toBeUndefined();
    expect(readAuthTokenFromUrlResult(TOKEN_URL_FOR_PARSE).token).toBe("abc");
  });

  it("prefers window query token then socket-url token", () => {
    const fromWindow = resolveBrowserAuthToken(
      createWindowLike(APP_URL_WITH_TOKEN),
      SOCKET_URL_WITH_TOKEN,
    );
    const fromSocket = resolveBrowserAuthToken(
      createWindowLike(APP_URL_NO_TOKEN),
      SOCKET_URL_WITH_TOKEN,
    );

    expect(fromWindow).toEqual({ token: "win" });
    expect(fromSocket).toEqual({ token: "env" });
  });

  it("resolves backend endpoints and propagates typed issues", () => {
    const resolved = resolveBrowserBackendEndpoints(
      createWindowLike(APP_URL_NO_TOKEN),
      SOCKET_URL_WITH_TOKEN,
    );
    const invalid = resolveBrowserBackendEndpoints(
      createWindowLike(APP_URL_NO_TOKEN),
      INVALID_SOCKET_URL,
    );

    expect(resolved).toEqual({
      ok: true,
      endpoints: {
        terminalWsUrl: SOCKET_URL_WITH_TOKEN,
        sessionsHttpUrl: "https://ws.example/api/sessions",
      },
    });
    expect(invalid).toMatchObject({
      ok: false,
      issue: {
        code: "env_socket_url_unsupported_protocol",
      },
    });
  });

  it("reads auth token from browser window helper", () => {
    expect(readAuthTokenFromWindow(createWindowLike(APP_URL_WITH_TOKEN))).toBe(
      "win",
    );
    expect(readAuthTokenFromWindow(createWindowLike(APP_URL_NO_TOKEN))).toBe(
      undefined,
    );
  });
});
