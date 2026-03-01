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
import type {
  TerminalTransport,
  TerminalTransportCloseEvent,
  TerminalTransportErrorEvent,
  TerminalTransportEventMap,
  TerminalTransportEventType,
  TerminalTransportFailureCode,
  TerminalTransportListener,
} from "../../../../src/features/terminal/contracts/transport";
import { TRANSPORT_READY_STATE } from "../../../../src/features/terminal/contracts/transport";
import type {
  ScheduledTask,
  Scheduler,
  SchedulerTimerHandle,
} from "../../../../src/features/terminal/platform/scheduler";
import { createPingMessage } from "../../../../src/features/terminal/protocol/terminal-client-messages";

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
