import { describe, expect, it } from "vitest";
import { resolveBrowserBackendEndpoints } from "../../../src/features/terminal/bootstrap/resolution/bootstrap-context";

const APP_URL_NO_TOKEN = "https://app.example/";
const SOCKET_URL = "wss://ws.example/api/terminal";
const INVALID_SOCKET_URL = "ftp://ws.example";
const EXPECTED_SESSIONS_URL = (() => {
  const parsed = new URL(SOCKET_URL);
  parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
  parsed.pathname = "/api/sessions";
  parsed.search = "";
  return parsed.toString();
})();

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
  it("resolves backend endpoints and propagates typed issues", () => {
    const resolved = resolveBrowserBackendEndpoints(
      createWindowLike(APP_URL_NO_TOKEN),
      SOCKET_URL,
    );
    const invalid = resolveBrowserBackendEndpoints(
      createWindowLike(APP_URL_NO_TOKEN),
      INVALID_SOCKET_URL,
    );

    expect(resolved).toEqual({
      ok: true,
      endpoints: {
        terminalWsUrl: SOCKET_URL,
        sessionsHttpUrl: EXPECTED_SESSIONS_URL,
      },
    });
    expect(invalid).toMatchObject({
      ok: false,
      issue: {
        code: "env_socket_url_unsupported_protocol",
      },
    });
  });

  it("does not inject token-derived state into backend endpoint resolution", () => {
    expect(
      resolveBrowserBackendEndpoints(
        createWindowLike(APP_URL_NO_TOKEN),
        SOCKET_URL,
      ),
    ).toEqual({
      ok: true,
      endpoints: {
        terminalWsUrl: SOCKET_URL,
        sessionsHttpUrl: EXPECTED_SESSIONS_URL,
      },
    });
  });
});
