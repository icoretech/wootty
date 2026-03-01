import { describe, expect, it, vi } from "vitest";
import { TransportHeartbeatMonitor } from "../../../../../src/features/terminal/app/engine/transport/reliability/transport-heartbeat-monitor";
import { TERMINAL_HEARTBEAT_MS } from "../../../../../src/features/terminal/app/engine/transport/state/transport-policy";
import type { Scheduler } from "../../../../../src/features/terminal/platform/scheduler";

type FakeScheduler = Scheduler & {
  intervalTask: (() => void) | null;
  timeoutTask: (() => void) | null;
};

function createScheduler(nowMs: () => number): FakeScheduler {
  const scheduler: FakeScheduler = {
    intervalTask: null,
    timeoutTask: null,
    now: nowMs,
    setTimeout: vi.fn((task: () => void) => {
      scheduler.timeoutTask = task;
      return 101;
    }),
    clearTimeout: vi.fn(),
    setInterval: vi.fn((task: () => void, delayMs: number) => {
      expect(delayMs).toBe(TERMINAL_HEARTBEAT_MS.INTERVAL);
      scheduler.intervalTask = task;
      return 201;
    }),
    clearInterval: vi.fn(),
  };
  return scheduler;
}

describe("transport heartbeat monitor", () => {
  it("emits ping, timeout, and latency using scheduler timers", () => {
    let now = 1_000;
    const scheduler = createScheduler(() => now);
    const onPing = vi.fn();
    const onPongTimeout = vi.fn();
    const onLatency = vi.fn();

    const monitor = new TransportHeartbeatMonitor({
      scheduler,
      onPing,
      onPongTimeout,
      onLatency,
    });

    monitor.start();
    expect(scheduler.setInterval).toHaveBeenCalledTimes(1);
    expect(scheduler.intervalTask).not.toBeNull();

    scheduler.intervalTask?.();
    expect(onPing).toHaveBeenCalledTimes(1);
    expect(scheduler.setTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      TERMINAL_HEARTBEAT_MS.PONG_TIMEOUT,
    );

    now += 37;
    monitor.markPong();
    expect(onLatency).toHaveBeenCalledWith(37);
    expect(scheduler.clearTimeout).toHaveBeenCalledWith(101);
  });

  it("clears interval and pending timeout on stop", () => {
    const scheduler = createScheduler(() => 5_000);
    const monitor = new TransportHeartbeatMonitor({
      scheduler,
      onPing: vi.fn(),
      onPongTimeout: vi.fn(),
      onLatency: vi.fn(),
    });

    monitor.start();
    scheduler.intervalTask?.();
    monitor.stop();

    expect(scheduler.clearInterval).toHaveBeenCalledWith(201);
    expect(scheduler.clearTimeout).toHaveBeenCalledWith(101);
  });

  it("does not postpone pong timeout while pings continue without pong", () => {
    const scheduler = createScheduler(() => 10_000);
    const onPongTimeout = vi.fn();
    const monitor = new TransportHeartbeatMonitor({
      scheduler,
      onPing: vi.fn(),
      onPongTimeout,
      onLatency: vi.fn(),
    });

    monitor.start();
    scheduler.intervalTask?.();
    scheduler.intervalTask?.();

    expect(scheduler.setTimeout).toHaveBeenCalledTimes(1);
    scheduler.timeoutTask?.();
    expect(onPongTimeout).toHaveBeenCalledTimes(1);
  });
});
