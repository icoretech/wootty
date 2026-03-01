import { describe, expect, it, vi } from "vitest";
import { TransportConnectionBootstrap } from "../../../../src/features/terminal/app/engine/transport/transport-connection-bootstrap";
import { TRANSPORT_READY_STATE } from "../../../../src/features/terminal/contracts/transport/transport";
import { FakeTransport } from "../../../support/harness/fake-transport";

const VALID_TERMINAL_WS_URL = "wss://example.test/api/terminal";
const UNSUPPORTED_TERMINAL_URL = "http://example.test/api/terminal";

describe("transport connection bootstrap", () => {
  it("creates transport for valid websocket endpoints", () => {
    const socket = new FakeTransport();
    const createTransport = vi.fn((url: string) => {
      expect(url).toBe(VALID_TERMINAL_WS_URL);
      return socket;
    });
    const bootstrap = new TransportConnectionBootstrap({
      createTransport,
      getWsUrl: () => VALID_TERMINAL_WS_URL,
    });

    const result = bootstrap.createSocket();

    expect(result).toEqual({ ok: true, socket });
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(result.ok && result.socket.readyState).toBe(
      TRANSPORT_READY_STATE.CONNECTING,
    );
  });

  it("returns typed endpoint issues for unavailable and unsupported endpoints", () => {
    const createTransport = vi.fn(() => {
      return new FakeTransport();
    });
    const unavailable = new TransportConnectionBootstrap({
      createTransport,
      getWsUrl: () => null,
    });
    const unsupported = new TransportConnectionBootstrap({
      createTransport,
      getWsUrl: () => UNSUPPORTED_TERMINAL_URL,
    });

    expect(unavailable.createSocket()).toMatchObject({
      ok: false,
      reasonCode: "endpoint_unavailable",
    });
    expect(unsupported.createSocket()).toMatchObject({
      ok: false,
      reasonCode: "endpoint_unsupported_protocol",
    });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("surfaces bootstrap failures when socket factory throws", () => {
    const boom = new Error("socket factory exploded");
    const bootstrap = new TransportConnectionBootstrap({
      createTransport: () => {
        throw boom;
      },
      getWsUrl: () => VALID_TERMINAL_WS_URL,
    });

    expect(bootstrap.createSocket()).toMatchObject({
      ok: false,
      reasonCode: "bootstrap_failed",
      debugDetail: "socket factory exploded",
      cause: boom,
    });
  });
});
