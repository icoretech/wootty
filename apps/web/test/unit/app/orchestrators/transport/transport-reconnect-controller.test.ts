import { describe, expect, it, vi } from "vitest";
import { TransportReconnectController } from "../../../../../src/features/terminal/app/engine/transport/reliability/transport-reconnect-controller";
import { FakeScheduler } from "../../../../support/harness/fake-scheduler";

describe("transport reconnect controller", () => {
  it("schedules and clears reconnect timers", () => {
    const scheduler = new FakeScheduler();
    const controller = new TransportReconnectController({ scheduler });
    const task = vi.fn();

    controller.scheduleReconnect(200, task);
    scheduler.advanceBy(199);
    expect(task).not.toHaveBeenCalled();
    scheduler.advanceBy(1);
    expect(task).toHaveBeenCalledTimes(1);

    controller.scheduleReconnect(200, task);
    controller.clearReconnectTimer();
    scheduler.advanceBy(500);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("replaces prior reconnect timer when scheduling a new one", () => {
    const scheduler = new FakeScheduler();
    const controller = new TransportReconnectController({ scheduler });
    const first = vi.fn();
    const second = vi.fn();

    controller.scheduleReconnect(200, first);
    controller.scheduleReconnect(200, second);
    scheduler.advanceBy(201);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
