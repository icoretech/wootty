import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTransportOrchestrator } from "../../../../src/features/terminal/app/engine/transport/transport-orchestrator";
import {
  reconnectDelayMs,
  TERMINAL_CLOSE_CODE,
  TERMINAL_HEARTBEAT_MS,
  TERMINAL_RECONNECT_POLICY,
} from "../../../../src/features/terminal/app/engine/transport/transport-policy";
import type { TerminalTransportMessageEvent } from "../../../../src/features/terminal/contracts/transport";
import type { Scheduler } from "../../../../src/features/terminal/platform/scheduler";
import { FakeScheduler } from "../../../support/harness/fake-scheduler";
import { FakeTransport } from "../../../support/harness/fake-transport";

function useHarness(
  scheduler: Scheduler,
  sockets: FakeTransport[],
  onSocketFailure: ReturnType<typeof vi.fn>,
) {
  return useTransportOrchestrator({
    createTransport: () => {
      const socket = new FakeTransport();
      sockets.push(socket);
      return socket;
    },
    wsUrl: "ws://localhost/api/terminal",
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
    const onSocketFailure = vi.fn();
    const { result } = renderHook(() =>
      useHarness(scheduler, sockets, onSocketFailure),
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
    expect(onSocketFailure).toHaveBeenCalledWith(
      "close",
      TERMINAL_CLOSE_CODE.PONG_TIMEOUT,
      "pong timeout",
    );
  });

  it("exhausts reconnect attempts deterministically with scheduler-driven backoff", async () => {
    const scheduler = new FakeScheduler();
    const sockets: FakeTransport[] = [];
    const onSocketFailure = vi.fn();
    const { result } = renderHook(() =>
      useHarness(scheduler, sockets, onSocketFailure),
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
    const onSocketFailure = vi.fn();
    const { result } = renderHook(() =>
      useHarness(scheduler, sockets, onSocketFailure),
    );

    act(() => {
      result.current.connect();
      sockets[0].emitOpen();
      sockets[0].emitError("boom");
      sockets[0].emitError("boom");
    });

    expect(onSocketFailure).toHaveBeenCalledTimes(1);
    expect(onSocketFailure).toHaveBeenLastCalledWith(
      "error",
      undefined,
      "boom",
    );

    act(() => {
      scheduler.advanceBy(16_000);
      sockets[0].emitError("boom");
    });

    expect(onSocketFailure).toHaveBeenCalledTimes(2);
    expect(onSocketFailure).toHaveBeenLastCalledWith(
      "error",
      undefined,
      "boom (repeated 3 times)",
    );
  });
});
