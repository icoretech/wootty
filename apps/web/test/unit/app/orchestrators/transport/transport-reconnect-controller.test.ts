import { describe, expect, it, vi } from "vitest";
import { TransportReconnectController } from "../../../../../src/features/terminal/app/engine/transport/transport-reconnect-controller";
import { FakeScheduler } from "../../../../support/harness/fake-scheduler";

describe("transport reconnect controller", () => {
  it("tracks socket error marker and close-failure reporting policy", () => {
    const controller = new TransportReconnectController({
      scheduler: new FakeScheduler(),
    });

    expect(controller.consumeShouldReportCloseFailure()).toBe(true);

    controller.markSocketError();
    expect(controller.consumeShouldReportCloseFailure()).toBe(false);
    expect(controller.consumeShouldReportCloseFailure()).toBe(true);
  });

  it("tracks fresh-connect intent once and then clears it", () => {
    const controller = new TransportReconnectController({
      scheduler: new FakeScheduler(),
    });

    controller.beginFreshConnect();
    expect(controller.consumePendingFreshConnect()).toBe(true);
    expect(controller.consumePendingFreshConnect()).toBe(false);
  });

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

  it("marks user-initiated disposal state and clears marker", () => {
    const controller = new TransportReconnectController({
      scheduler: new FakeScheduler(),
    });

    controller.beginDispose();
    expect(controller.isClosedByUser()).toBe(true);
    controller.clearUserCloseMarker();
    expect(controller.isClosedByUser()).toBe(false);
  });

  it("clears disposal and pending-fresh markers when a reconnect starts", () => {
    const controller = new TransportReconnectController({
      scheduler: new FakeScheduler(),
    });

    controller.beginDispose();
    controller.beginFreshConnect();
    expect(controller.consumePendingFreshConnect()).toBe(true);

    controller.beginFreshConnect();
    controller.beginReconnect();
    expect(controller.isClosedByUser()).toBe(false);
    expect(controller.consumePendingFreshConnect()).toBe(false);
  });
});
