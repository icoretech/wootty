import { describe, expect, it } from "vitest";
import { validateWebsocketEndpoint } from "../../../src/features/terminal/contracts/websocket-endpoint-validation";

describe("validateWebsocketEndpoint", () => {
  it("accepts valid websocket endpoints", () => {
    expect(validateWebsocketEndpoint("ws://localhost:8080/terminal")).toEqual({
      ok: true,
      endpoint: "ws://localhost:8080/terminal",
    });
    expect(validateWebsocketEndpoint(" wss://example.com/socket ")).toEqual({
      ok: true,
      endpoint: "wss://example.com/socket",
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
    expect(validateWebsocketEndpoint("ws://[::1")).toEqual({
      ok: false,
      reason: "invalid_format",
    });
    expect(validateWebsocketEndpoint("https://example.com/socket")).toEqual({
      ok: false,
      reason: "unsupported_protocol",
      protocol: "https:",
    });
  });
});
