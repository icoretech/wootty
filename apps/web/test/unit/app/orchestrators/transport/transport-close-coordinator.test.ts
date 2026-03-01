import { describe, expect, it, vi } from "vitest";
import { TransportCloseCoordinator } from "../../../../../src/features/terminal/app/engine/transport/lifecycle/transport-close-coordinator";
import { reconnectDelayMs } from "../../../../../src/features/terminal/app/engine/transport/state/transport-policy";
import { FakeScheduler } from "../../../../support/harness/fake-scheduler";

describe("transport close coordinator", () => {
  it("schedules reconnect through the scheduler and supports timer cancellation", () => {
    const scheduler = new FakeScheduler();
    const dispatchEvent = vi.fn();
    const connect = vi.fn();
    const reportCloseFailure = vi.fn();
    const coordinator = new TransportCloseCoordinator({
      scheduler,
      dispatchEvent,
      connect,
      reportCloseFailure,
    });

    coordinator.handleSocketClose({
      closeIntent: "normal",
      closeCode: 1006,
      closeReason: "abnormal closure",
      reconnectAttempt: 0,
      shouldReportCloseFailure: true,
    });

    expect(reportCloseFailure).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledWith({
      type: "schedule-reconnect",
      attempt: 1,
    });
    expect(connect).not.toHaveBeenCalled();

    scheduler.advanceBy(reconnectDelayMs(0) - 1);
    expect(connect).not.toHaveBeenCalled();

    coordinator.clearReconnectTimer();
    scheduler.advanceBy(1);
    expect(connect).not.toHaveBeenCalled();
  });

  it("does not schedule reconnect for dispose intent", () => {
    const scheduler = new FakeScheduler();
    const dispatchEvent = vi.fn();
    const connect = vi.fn();
    const reportCloseFailure = vi.fn();
    const coordinator = new TransportCloseCoordinator({
      scheduler,
      dispatchEvent,
      connect,
      reportCloseFailure,
    });

    coordinator.handleSocketClose({
      closeIntent: "dispose",
      closeCode: 1000,
      closeReason: "component unmount",
      reconnectAttempt: 0,
      shouldReportCloseFailure: true,
    });

    expect(dispatchEvent).toHaveBeenCalledWith({ type: "socket-closed" });
    scheduler.advanceBy(reconnectDelayMs(0));
    expect(connect).not.toHaveBeenCalled();
    expect(reportCloseFailure).not.toHaveBeenCalled();
  });
});
