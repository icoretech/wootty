import { describe, expect, it, vi } from "vitest";
import type { TransportFailure } from "../../../../../src/features/terminal/app/engine/transport/contracts/transport-failure-contract";
import {
  type TransportHandlers,
  TransportLifecycleService,
} from "../../../../../src/features/terminal/app/engine/transport/lifecycle/transport-lifecycle-service";
import {
  reconnectDelayMs,
  TERMINAL_CLOSE_CODE,
  TERMINAL_HEARTBEAT_MS,
} from "../../../../../src/features/terminal/app/engine/transport/state/transport-policy";
import {
  initialTransportState,
  reduceTransportState,
  type TransportEvent,
  type TransportState,
} from "../../../../../src/features/terminal/app/engine/transport/state/transport-state-machine";
import { createPingMessage } from "../../../../../src/features/terminal/protocol/terminal-client-messages";
import { FakeScheduler } from "../../../../support/harness/fake-scheduler";
import { FakeTransport } from "../../../../support/harness/fake-transport";

function createHarness({
  wsUrl = "ws://localhost/api/terminal",
}: {
  wsUrl?: string | null;
} = {}) {
  const scheduler = new FakeScheduler();
  const sockets: FakeTransport[] = [];
  const transportUrls: string[] = [];
  let currentWsUrl = wsUrl;
  let state: TransportState = initialTransportState;
  const events: TransportEvent[] = [];
  const onSocketFailure = vi.fn<(failure: TransportFailure) => void>();

  const handlers: TransportHandlers = {
    onOpen: vi.fn(),
    onMessage: vi.fn(),
  };
  let currentHandlers = handlers;
  let currentHasSessionContext = true;
  let currentOnSocketFailure = onSocketFailure;
  const runtime = {
    wsUrl: () => currentWsUrl,
    handlers: () => currentHandlers,
    hasSessionContext: () => currentHasSessionContext,
    onSocketFailure: (failure: TransportFailure) => {
      currentOnSocketFailure(failure);
    },
  };

  const service = new TransportLifecycleService({
    createTransport: (url) => {
      transportUrls.push(url);
      const socket = new FakeTransport();
      sockets.push(socket);
      return socket;
    },
    scheduler,
    runtime,
    getState: () => state,
    dispatchEvent: (event) => {
      events.push(event);
      state = reduceTransportState(state, event);
    },
  });

  return {
    scheduler,
    sockets,
    transportUrls,
    setWsUrl: (nextWsUrl: string | null) => {
      currentWsUrl = nextWsUrl;
    },
    swapRuntime: (next: {
      wsUrl: string | null;
      handlers: TransportHandlers;
      hasSessionContext: boolean;
      onSocketFailure: (failure: TransportFailure) => void;
    }) => {
      currentWsUrl = next.wsUrl;
      currentHandlers = next.handlers;
      currentHasSessionContext = next.hasSessionContext;
      currentOnSocketFailure = next.onSocketFailure;
    },
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
      expect.objectContaining({
        source: "error",
        reasonCode: "endpoint_unsupported_protocol",
        technicalDetail: expect.stringContaining(
          "invalid websocket endpoint protocol",
        ),
        noticeMessage: expect.stringContaining(
          "invalid websocket endpoint protocol",
        ),
      }),
    );
  });

  // @trace FR-3 heartbeat-reconnect
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

  it("rebinds to the latest endpoint when websocket url changes mid-connection", () => {
    const harness = createHarness({
      wsUrl: "ws://localhost/api/terminal?token=one",
    });

    harness.service.connect();
    expect(harness.transportUrls).toEqual([
      "ws://localhost/api/terminal?token=one",
    ]);
    harness.sockets[0].emitOpen();

    harness.setWsUrl("ws://localhost/api/terminal?token=two");
    harness.service.reconnectWithEndpointChange();

    expect(harness.transportUrls).toEqual([
      "ws://localhost/api/terminal?token=one",
      "ws://localhost/api/terminal?token=two",
    ]);
    expect(harness.sockets[0].closeCalls).toContainEqual({
      code: TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
      reason: "endpoint changed",
    });
    expect(harness.sockets).toHaveLength(2);
  });

  it("uses the latest swapped runtime context for reconnect flows", () => {
    const harness = createHarness({
      wsUrl: "ws://localhost/api/terminal?token=one",
    });

    harness.service.connect();
    harness.sockets[0].emitOpen();

    const swappedHandlers: TransportHandlers = {
      onOpen: vi.fn(),
      onMessage: vi.fn(),
    };
    harness.swapRuntime({
      wsUrl: "ws://localhost/api/terminal?token=two",
      handlers: swappedHandlers,
      hasSessionContext: false,
      onSocketFailure: harness.onSocketFailure,
    });

    harness.service.reconnectWithEndpointChange();
    harness.sockets[1].emitOpen();

    expect(harness.transportUrls).toEqual([
      "ws://localhost/api/terminal?token=one",
      "ws://localhost/api/terminal?token=two",
    ]);
    expect(swappedHandlers.onOpen).toHaveBeenCalledTimes(1);
  });

  it("opens a fresh socket immediately when starting a fresh session", () => {
    const harness = createHarness();

    harness.service.connect();
    harness.sockets[0].emitOpen();

    harness.service.scheduleFreshConnection();

    expect(harness.sockets).toHaveLength(2);
    expect(harness.sockets[0].closeCalls).toContainEqual({
      code: TERMINAL_CLOSE_CODE.START_FRESH_SESSION,
      reason: "start fresh session",
    });
  });

  it("suppresses duplicate close notices when socket error already reported", () => {
    const harness = createHarness();

    harness.service.connect();
    harness.sockets[0].emitOpen();
    harness.sockets[0].emitError("transport exploded");
    harness.sockets[0].emitClose(1006, "abnormal closure");

    expect(harness.onSocketFailure).toHaveBeenCalledTimes(1);
    expect(harness.onSocketFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "error",
        reasonCode: "socket_failure",
        technicalDetail: "transport exploded",
        noticeMessage: "transport exploded",
      }),
    );
  });

  it("forwards socket error cause details to the failure sink", () => {
    const harness = createHarness();
    const failureCause = new Error("transport cause");

    harness.service.connect();
    harness.sockets[0].emitOpen();
    harness.sockets[0].emitError("transport exploded", {
      code: "ws_error",
      cause: failureCause,
    });

    expect(harness.onSocketFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "error",
        reasonCode: "socket_failure",
        technicalDetail: "transport exploded",
        code: "ws_error",
        cause: failureCause,
      }),
    );
  });
});
