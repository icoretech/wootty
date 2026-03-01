import { describe, expect, it, vi } from "vitest";
import {
  type SocketFailureSource,
  type TransportHandlers,
  TransportLifecycleService,
} from "../../../../src/features/terminal/app/engine/transport/transport-lifecycle-service";
import {
  reconnectDelayMs,
  TERMINAL_CLOSE_CODE,
  TERMINAL_HEARTBEAT_MS,
} from "../../../../src/features/terminal/app/engine/transport/transport-policy";
import {
  initialTransportState,
  reduceTransportState,
  type TransportEvent,
  type TransportState,
} from "../../../../src/features/terminal/app/engine/transport/transport-state-machine";
import type { TerminalTransportFailureCode } from "../../../../src/features/terminal/contracts/transport";
import { createPingMessage } from "../../../../src/features/terminal/protocol/terminal-client-messages";
import { FakeScheduler } from "../../../support/harness/fake-scheduler";
import { FakeTransport } from "../../../support/harness/fake-transport";

function createHarness({
  wsUrl = "ws://localhost/api/terminal",
}: {
  wsUrl?: string | null;
} = {}) {
  const scheduler = new FakeScheduler();
  const sockets: FakeTransport[] = [];
  let state: TransportState = initialTransportState;
  const events: TransportEvent[] = [];
  const onSocketFailure =
    vi.fn<
      (
        source: SocketFailureSource,
        code?: TerminalTransportFailureCode,
        reason?: string,
      ) => void
    >();

  const handlers: TransportHandlers = {
    onOpen: vi.fn(),
    onMessage: vi.fn(),
  };

  const service = new TransportLifecycleService({
    createTransport: () => {
      const socket = new FakeTransport();
      sockets.push(socket);
      return socket;
    },
    getWsUrl: () => wsUrl,
    getHandlers: () => handlers,
    hasSessionContext: () => true,
    scheduler,
    onSocketFailure,
    getState: () => state,
    dispatchEvent: (event) => {
      events.push(event);
      state = reduceTransportState(state, event);
    },
  });

  return {
    scheduler,
    sockets,
    state: () => state,
    events,
    onSocketFailure,
    handlers,
    service,
  };
}

describe("transport lifecycle service", () => {
  it("fails fast on invalid websocket endpoint without creating transport", () => {
    const invalidProtocolEndpoint = `http://${"localhost"}/terminal`;
    const harness = createHarness({ wsUrl: invalidProtocolEndpoint });

    harness.service.connect();

    expect(harness.sockets).toHaveLength(0);
    expect(harness.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "set-connecting",
        "socket-failure",
        "socket-error",
      ]),
    );
    expect(harness.onSocketFailure).toHaveBeenCalledWith(
      "error",
      undefined,
      expect.stringContaining("invalid websocket endpoint protocol"),
    );
  });

  it("drives heartbeat timeout and schedules reconnect", () => {
    const harness = createHarness();

    harness.service.connect();
    expect(harness.sockets).toHaveLength(1);
    harness.sockets[0].emitOpen();
    expect(harness.handlers.onOpen).toHaveBeenCalledTimes(1);

    expect(harness.service.sendPayload(createPingMessage())).toBe(true);
    expect(harness.sockets[0].sentPayloads.at(-1)).toContain('"type":"ping"');

    harness.scheduler.advanceBy(TERMINAL_HEARTBEAT_MS.INTERVAL);
    harness.scheduler.advanceBy(TERMINAL_HEARTBEAT_MS.PONG_TIMEOUT);

    expect(harness.sockets[0].closeCalls).toContainEqual({
      code: TERMINAL_CLOSE_CODE.PONG_TIMEOUT,
      reason: "pong timeout",
    });
    expect(harness.state().status).toBe("reconnecting");

    harness.scheduler.advanceBy(reconnectDelayMs(0));
    expect(harness.sockets).toHaveLength(2);
  });

  it("computes latency when markPong is called after heartbeat ping", () => {
    const harness = createHarness();

    harness.service.connect();
    harness.sockets[0].emitOpen();
    harness.scheduler.advanceBy(TERMINAL_HEARTBEAT_MS.INTERVAL);
    harness.scheduler.advanceBy(50);
    harness.service.markPong();

    expect(harness.state().latencyMs).toBe(50);
  });
});
