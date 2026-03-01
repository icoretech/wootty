import { describe, expect, it } from "vitest";
import { validateWebsocketEndpoint } from "../../../src/features/terminal/validation/websocket-endpoint";

function buildEndpoint(
  protocol: "ws:" | "wss:" | "https:",
  host: string,
  pathname: string,
): string {
  const url = new URL(window.location.href);
  url.protocol = protocol;
  url.host = host;
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

describe("validateWebsocketEndpoint", () => {
  it("accepts valid websocket endpoints", () => {
    const plainEndpoint = buildEndpoint("ws:", "localhost:8080", "/terminal");
    const secureEndpoint = buildEndpoint("wss:", "example.com", "/socket");
    expect(validateWebsocketEndpoint(plainEndpoint)).toEqual({
      ok: true,
      endpoint: plainEndpoint,
    });
    expect(validateWebsocketEndpoint(` ${secureEndpoint} `)).toEqual({
      ok: true,
      endpoint: secureEndpoint,
    });
  });

  it("reports unavailable endpoint for empty inputs", () => {
    expect(validateWebsocketEndpoint(undefined)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(validateWebsocketEndpoint("")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("reports invalid and unsupported endpoint formats", () => {
    const malformedEndpoint = `ws:${"//"}[::1`;
    expect(validateWebsocketEndpoint(malformedEndpoint)).toEqual({
      ok: false,
      reason: "invalid_format",
    });
    expect(
      validateWebsocketEndpoint(
        buildEndpoint("https:", "example.com", "/socket"),
      ),
    ).toEqual({
      ok: false,
      reason: "unsupported_protocol",
      protocol: "https:",
    });
  });
});
