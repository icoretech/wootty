import { act, renderHook } from "@testing-library/react";
import type { MutableRefObject } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionTransportCapability } from "../../../../../src/features/terminal/app/engine/connection-transport-capability";
import { useConnectionMessageGateway } from "../../../../../src/features/terminal/app/engine/protocol/connection-message-gateway";
import {
  type TransportOrchestrator,
  useTransportOrchestrator,
} from "../../../../../src/features/terminal/app/engine/transport/transport-orchestrator";
import type { Scheduler } from "../../../../../src/features/terminal/platform/scheduler";
import {
  TERMINAL_CLIENT_MESSAGE_TYPE,
  TERMINAL_WIRE_CONTRACT_VERSION,
} from "../../../../../src/features/terminal/protocol/terminal-wire-schema";

vi.mock(
  "../../../../../src/features/terminal/app/engine/protocol/connection-message-gateway",
  () => ({
    useConnectionMessageGateway: vi.fn(),
  }),
);

vi.mock(
  "../../../../../src/features/terminal/app/engine/transport/transport-orchestrator",
  () => ({
    useTransportOrchestrator: vi.fn(),
  }),
);

const mockedUseConnectionMessageGateway = vi.mocked(
  useConnectionMessageGateway,
);
const mockedUseTransportOrchestrator = vi.mocked(useTransportOrchestrator);

const browserLikeScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (task, delayMs) => window.setTimeout(task, delayMs),
  clearTimeout: (timerId) => {
    window.clearTimeout(timerId);
  },
  setInterval: (task, intervalMs) => window.setInterval(task, intervalMs),
  clearInterval: (timerId) => {
    window.clearInterval(timerId);
  },
};

function createOrchestratorDouble(): TransportOrchestrator {
  return {
    status: "connected",
    reconnectAttempt: 0,
    latencyMs: null,
    lastSocketFailure: "",
    sendPayload: vi.fn(),
    markPong: vi.fn(),
    connect: vi.fn(),
    reconnectNow: vi.fn(),
    reconnectWithEndpointChange: vi.fn(),
    scheduleFreshConnection: vi.fn(),
    dispose: vi.fn(),
  };
}

function createTransportCapabilityArgs() {
  const publishNotice = vi.fn();
  return {
    createTransport: vi.fn(),
    wsUrl: "wss://terminal.example/ws",
    attachMode: "watch" as const,
    sessionId: "session-42",
    hasSessionContext: () => true,
    publishNotice,
    setStatusFlag: vi.fn(),
    setSessionMode: vi.fn(),
    applyReadySession: vi.fn(),
    clearMissingSession: vi.fn(),
    requestTransportRefresh: vi.fn(async () => ({ ok: true as const })),
    writeServerError: vi.fn(),
    flushAfterReady: vi.fn(),
    writeOutputAndTrackBytes: vi.fn(),
    writeExit: vi.fn(),
    sendNow: vi.fn(() => true),
    runtimeFitSizeRef: {
      current: { cols: 120, rows: 40 },
    } as MutableRefObject<{ cols: number; rows: number }>,
    markPongRef: {
      current: vi.fn(),
    } as MutableRefObject<() => void>,
    scheduler: browserLikeScheduler,
  };
}

describe("connection transport capability", () => {
  beforeEach(() => {
    mockedUseConnectionMessageGateway.mockReset();
    mockedUseTransportOrchestrator.mockReset();
    mockedUseConnectionMessageGateway.mockReturnValue({
      handleSocketMessage: vi.fn(),
    });
    mockedUseTransportOrchestrator.mockReturnValue(createOrchestratorDouble());
  });

  it("maps socket failures to transport notices", () => {
    const args = createTransportCapabilityArgs();

    renderHook(() => useConnectionTransportCapability(args));

    const orchestratorArgs = mockedUseTransportOrchestrator.mock.calls[0]?.[0];
    expect(orchestratorArgs).toBeDefined();

    act(() => {
      orchestratorArgs?.onSocketFailure({
        source: "error",
        code: "boom",
        reasonCode: "socket_failure",
        technicalDetail: "socket broke",
        noticeMessage: "connection lost",
        cause: new Error("boom"),
      });
    });

    expect(args.publishNotice).toHaveBeenCalledWith({
      context: "transport",
      source: "error",
      reasonCode: "socket_failure",
      code: "boom",
      debugDetail: "socket broke",
      noticeMessage: "connection lost",
      cause: expect.any(Error),
    });
  });

  it("publishes attach handshake failure when attach payload cannot be sent", () => {
    const args = createTransportCapabilityArgs();
    args.sendNow = vi.fn(() => false);

    renderHook(() => useConnectionTransportCapability(args));

    const orchestratorArgs = mockedUseTransportOrchestrator.mock.calls[0]?.[0];
    expect(orchestratorArgs).toBeDefined();

    act(() => {
      orchestratorArgs?.handlers.onOpen();
    });

    expect(args.setStatusFlag).toHaveBeenCalledWith(null);
    expect(args.sendNow).toHaveBeenCalledWith(
      expect.objectContaining({
        type: TERMINAL_CLIENT_MESSAGE_TYPE.ATTACH,
        version: TERMINAL_WIRE_CONTRACT_VERSION,
        cols: 120,
        rows: 40,
        sessionId: "session-42",
        watch: true,
      }),
    );
    expect(args.publishNotice).toHaveBeenCalledWith({
      context: "transport",
      reasonCode: "attach_handshake_send_failed",
    });
  });

  it("routes malformed and valid socket messages through the proper channels", () => {
    const args = createTransportCapabilityArgs();
    const handleSocketMessage = vi.fn();
    mockedUseConnectionMessageGateway.mockReturnValue({
      handleSocketMessage,
    });

    renderHook(() => useConnectionTransportCapability(args));

    const orchestratorArgs = mockedUseTransportOrchestrator.mock.calls[0]?.[0];
    expect(orchestratorArgs).toBeDefined();

    act(() => {
      orchestratorArgs?.handlers.onMessage({
        data: "{}",
        malformed: "invalid json",
      });
    });
    expect(args.publishNotice).toHaveBeenCalledWith({
      context: "protocol",
      reason: "malformed_transport_event",
      details: "invalid json",
    });
    expect(handleSocketMessage).not.toHaveBeenCalled();

    act(() => {
      orchestratorArgs?.handlers.onMessage({
        data: '{"type":"ready"}',
      });
    });
    expect(handleSocketMessage).toHaveBeenCalledWith('{"type":"ready"}');
  });
});
