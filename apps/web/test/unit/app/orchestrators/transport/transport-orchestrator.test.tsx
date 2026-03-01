import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTransportOrchestrator } from "../../../../../src/features/terminal/app/engine/transport/transport-orchestrator";
import {
  reconnectDelayMs,
  TERMINAL_CLOSE_CODE,
  TERMINAL_HEARTBEAT_MS,
  TERMINAL_RECONNECT_POLICY,
} from "../../../../../src/features/terminal/app/engine/transport/transport-policy";
import type { TerminalTransportMessageEvent } from "../../../../../src/features/terminal/contracts/transport/transport";
import type { Scheduler } from "../../../../../src/features/terminal/platform/scheduler";
import { FakeScheduler } from "../../../../support/harness/fake-scheduler";
import { FakeTransport } from "../../../../support/harness/fake-transport";

function useHarness(
  scheduler: Scheduler,
  sockets: FakeTransport[],
  transportUrls: string[],
  onSocketFailure: ReturnType<typeof vi.fn>,
  wsUrl = "ws://localhost/api/terminal",
) {
  return useTransportOrchestrator({
    createTransport: (url) => {
      transportUrls.push(url);
      const socket = new FakeTransport();
      sockets.push(socket);
      return socket;
    },
    wsUrl,
    hasSessionContext: () => true,
    handlers: {
      onOpen: vi.fn(),
      onMessage: (_event: TerminalTransportMessageEvent) => {
        // no-op
      },
    },
    scheduler,
    onSocketFailure,
  });
}

describe("transport orchestrator", () => {
  it("drives heartbeat timeout through an injectable scheduler", async () => {
    const scheduler = new FakeScheduler();
    const sockets: FakeTransport[] = [];
    const transportUrls: string[] = [];
    const onSocketFailure = vi.fn();
    const { result } = renderHook(() =>
      useHarness(scheduler, sockets, transportUrls, onSocketFailure),
    );

    act(() => {
      result.current.connect();
    });
    expect(sockets).toHaveLength(1);

    act(() => {
      sockets[0].emitOpen();
      scheduler.advanceBy(TERMINAL_HEARTBEAT_MS.INTERVAL);
      scheduler.advanceBy(TERMINAL_HEARTBEAT_MS.PONG_TIMEOUT);
    });

    expect(sockets[0].sentPayloads[0]).toContain('"type":"ping"');
    expect(sockets[0].closeCalls).toContainEqual({
      code: TERMINAL_CLOSE_CODE.PONG_TIMEOUT,
      reason: "pong timeout",
    });
    await waitFor(() => {
      expect(result.current.reconnectAttempt).toBe(1);
      expect(result.current.status).toBe("reconnecting");
    });
    expect(onSocketFailure).toHaveBeenCalledWith({
      source: "close",
      code: TERMINAL_CLOSE_CODE.PONG_TIMEOUT,
      reasonCode: "socket_failure",
      technicalDetail: "pong timeout",
      noticeMessage: "pong timeout",
    });
  });

  it("exhausts reconnect attempts deterministically with scheduler-driven backoff", async () => {
    const scheduler = new FakeScheduler();
    const sockets: FakeTransport[] = [];
    const transportUrls: string[] = [];
    const onSocketFailure = vi.fn();
    const { result } = renderHook(() =>
      useHarness(scheduler, sockets, transportUrls, onSocketFailure),
    );

    act(() => {
      result.current.connect();
    });
    expect(sockets).toHaveLength(1);

    for (
      let attempt = 0;
      attempt <= TERMINAL_RECONNECT_POLICY.MAX_ATTEMPTS;
      attempt += 1
    ) {
      act(() => {
        sockets[sockets.length - 1].emitClose(1006, "boom");
      });

      if (attempt < TERMINAL_RECONNECT_POLICY.MAX_ATTEMPTS) {
        await waitFor(() => {
          expect(result.current.reconnectAttempt).toBe(attempt + 1);
          expect(result.current.status).toBe("reconnecting");
        });
        act(() => {
          scheduler.advanceBy(reconnectDelayMs(attempt));
        });
        expect(sockets).toHaveLength(attempt + 2);
      }
    }

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.lastSocketFailure).toContain("reconnect exhausted");
    expect(onSocketFailure).toHaveBeenCalled();
  });

  it("throttles repeated socket-failure notices for the same error context", () => {
    const scheduler = new FakeScheduler();
    const sockets: FakeTransport[] = [];
    const transportUrls: string[] = [];
    const onSocketFailure = vi.fn();
    const { result } = renderHook(() =>
      useHarness(scheduler, sockets, transportUrls, onSocketFailure),
    );

    act(() => {
      result.current.connect();
      sockets[0].emitOpen();
      sockets[0].emitError("boom");
      sockets[0].emitError("boom");
    });

    expect(onSocketFailure).toHaveBeenCalledTimes(1);
    expect(onSocketFailure).toHaveBeenLastCalledWith({
      source: "error",
      reasonCode: "socket_failure",
      technicalDetail: "boom",
      noticeMessage: "boom",
    });

    act(() => {
      scheduler.advanceBy(16_000);
      sockets[0].emitError("boom");
    });

    expect(onSocketFailure).toHaveBeenCalledTimes(2);
    expect(onSocketFailure).toHaveBeenLastCalledWith({
      source: "error",
      reasonCode: "socket_failure",
      technicalDetail: "boom",
      noticeMessage: "boom (repeated 3 times)",
    });
  });

  it("reconnects with the updated websocket endpoint on endpoint change", () => {
    const scheduler = new FakeScheduler();
    const sockets: FakeTransport[] = [];
    const transportUrls: string[] = [];
    const onSocketFailure = vi.fn();
    let wsUrl = "ws://localhost/api/terminal?token=one";
    const { result, rerender } = renderHook(() =>
      useHarness(scheduler, sockets, transportUrls, onSocketFailure, wsUrl),
    );

    act(() => {
      result.current.connect();
      sockets[0].emitOpen();
    });

    wsUrl = "ws://localhost/api/terminal?token=two";
    rerender();

    act(() => {
      result.current.reconnectWithEndpointChange();
    });

    expect(transportUrls).toEqual([
      "ws://localhost/api/terminal?token=one",
      "ws://localhost/api/terminal?token=two",
    ]);
    expect(sockets[0].closeCalls).toContainEqual({
      code: TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
      reason: "endpoint changed",
    });
  });

  it("does not dispose the active transport on non-transport rerenders", () => {
    const scheduler = new FakeScheduler();
    const sockets: FakeTransport[] = [];
    const transportUrls: string[] = [];
    const onSocketFailure = vi.fn();
    const { result, rerender } = renderHook(() =>
      useHarness(scheduler, sockets, transportUrls, onSocketFailure),
    );

    act(() => {
      result.current.connect();
      sockets[0].emitOpen();
    });

    const initialSocket = sockets[0];
    rerender();

    expect(sockets).toHaveLength(1);
    expect(initialSocket.closeCalls).toEqual([]);
  });
});
