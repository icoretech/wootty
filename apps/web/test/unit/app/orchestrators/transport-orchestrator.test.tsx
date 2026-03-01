import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTransportOrchestrator } from "../../../../src/features/terminal/app/engine/transport/transport-orchestrator";
import {
  reconnectDelayMs,
  TERMINAL_CLOSE_CODE,
  TERMINAL_HEARTBEAT_MS,
  TERMINAL_RECONNECT_POLICY,
} from "../../../../src/features/terminal/app/engine/transport/transport-policy";
import {
  type TerminalTransport,
  type TerminalTransportCloseEvent,
  type TerminalTransportErrorEvent,
  type TerminalTransportEventMap,
  type TerminalTransportEventType,
  type TerminalTransportListener,
  type TerminalTransportMessageEvent,
  TRANSPORT_READY_STATE,
} from "../../../../src/features/terminal/contracts/transport";
import type {
  ScheduledTask,
  Scheduler,
  SchedulerTimerHandle,
} from "../../../../src/features/terminal/platform/scheduler";

type PendingTask = {
  id: number;
  dueAtMs: number;
  task: ScheduledTask;
  intervalMs: number | null;
};

class FakeScheduler implements Scheduler {
  private nowMs = 0;
  private nextTaskId = 1;
  private tasks = new Map<number, PendingTask>();

  now(): number {
    return this.nowMs;
  }

  setTimeout(task: ScheduledTask, delayMs: number): SchedulerTimerHandle {
    const taskId = this.nextTaskId++;
    this.tasks.set(taskId, {
      id: taskId,
      dueAtMs: this.nowMs + Math.max(0, delayMs),
      task,
      intervalMs: null,
    });
    return taskId;
  }

  clearTimeout(timerId: SchedulerTimerHandle): void {
    this.tasks.delete(Number(timerId));
  }

  setInterval(task: ScheduledTask, intervalMs: number): SchedulerTimerHandle {
    const taskId = this.nextTaskId++;
    this.tasks.set(taskId, {
      id: taskId,
      dueAtMs: this.nowMs + Math.max(0, intervalMs),
      task,
      intervalMs: Math.max(1, intervalMs),
    });
    return taskId;
  }

  clearInterval(timerId: SchedulerTimerHandle): void {
    this.tasks.delete(Number(timerId));
  }

  advanceBy(deltaMs: number): void {
    const targetTime = this.nowMs + Math.max(0, deltaMs);

    while (true) {
      let nextTask: PendingTask | null = null;
      for (const task of this.tasks.values()) {
        if (task.dueAtMs > targetTime) {
          continue;
        }
        if (
          !nextTask ||
          task.dueAtMs < nextTask.dueAtMs ||
          (task.dueAtMs === nextTask.dueAtMs && task.id > nextTask.id)
        ) {
          nextTask = task;
        }
      }

      if (!nextTask) {
        break;
      }

      this.nowMs = nextTask.dueAtMs;
      if (nextTask.intervalMs === null) {
        this.tasks.delete(nextTask.id);
      } else {
        nextTask.dueAtMs += nextTask.intervalMs;
        this.tasks.set(nextTask.id, nextTask);
      }
      nextTask.task();
    }

    this.nowMs = targetTime;
  }
}

class FakeTransport implements TerminalTransport {
  readyState = TRANSPORT_READY_STATE.CONNECTING;
  sentPayloads: string[] = [];
  closeCalls: Array<{ code: number; reason: string }> = [];
  private listeners: {
    [K in TerminalTransportEventType]: Set<TerminalTransportListener<K>>;
  } = {
    open: new Set(),
    message: new Set(),
    close: new Set(),
    error: new Set(),
  };

  send(data: string): void {
    this.sentPayloads.push(data);
  }

  close(code?: number, reason?: string): void {
    const closeCode = code ?? 1000;
    const closeReason = reason ?? "";
    this.closeCalls.push({ code: closeCode, reason: closeReason });
    this.emitClose(closeCode, closeReason);
  }

  addEventListener<T extends TerminalTransportEventType>(
    type: T,
    listener: TerminalTransportListener<T>,
  ): void {
    this.listenerSet(type).add(listener);
  }

  removeEventListener<T extends TerminalTransportEventType>(
    type: T,
    listener: TerminalTransportListener<T>,
  ): void {
    this.listenerSet(type).delete(listener);
  }

  emitOpen(): void {
    this.readyState = TRANSPORT_READY_STATE.OPEN;
    this.emit("open", {});
  }

  emitMessage(event: TerminalTransportMessageEvent): void {
    this.emit("message", event);
  }

  emitError(message: string): void {
    const event: TerminalTransportErrorEvent = {
      source: "transport",
      message,
    };
    this.emit("error", event);
  }

  emitClose(code: number, reason: string): void {
    this.readyState = TRANSPORT_READY_STATE.CLOSED;
    const event: TerminalTransportCloseEvent = { code, reason };
    this.emit("close", event);
  }

  private emit<T extends TerminalTransportEventType>(
    type: T,
    event: TerminalTransportEventMap[T],
  ): void {
    for (const listener of this.listenerSet(type)) {
      listener(event);
    }
  }

  private listenerSet<T extends TerminalTransportEventType>(
    type: T,
  ): Set<TerminalTransportListener<T>> {
    return this.listeners[type];
  }
}

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
