import { describe, expect, it, vi } from "vitest";
import { executeTransportClosePlan } from "../../../../../src/features/terminal/app/engine/transport/lifecycle/transport-close-plan-executor";

describe("transport close plan executor", () => {
  it("handles dispose and manual reconnect plans through explicit delegates", () => {
    const dispatchEvent = vi.fn();
    const connect = vi.fn();
    const scheduleReconnect = vi.fn();
    const reportCloseFailure = vi.fn();

    executeTransportClosePlan(
      {
        closeIntent: "dispose",
        closeCode: 1000,
        reconnectAttempt: 0,
        shouldReportCloseFailure: true,
      },
      {
        dispatchEvent,
        connect,
        scheduleReconnect,
        reportCloseFailure,
      },
    );

    expect(dispatchEvent).toHaveBeenCalledWith({ type: "socket-closed" });
    expect(connect).not.toHaveBeenCalled();
    expect(scheduleReconnect).not.toHaveBeenCalled();
    expect(reportCloseFailure).not.toHaveBeenCalled();

    dispatchEvent.mockReset();
    executeTransportClosePlan(
      {
        closeIntent: "manual",
        closeCode: 1006,
        reconnectAttempt: 0,
        shouldReportCloseFailure: true,
      },
      {
        dispatchEvent,
        connect,
        scheduleReconnect,
        reportCloseFailure,
      },
    );

    expect(dispatchEvent).toHaveBeenCalledWith({
      type: "set-connecting",
      reconnecting: false,
    });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(scheduleReconnect).not.toHaveBeenCalled();
    expect(reportCloseFailure).not.toHaveBeenCalled();
  });

  it("reports close failures and schedules reconnect for recoverable closes", () => {
    const dispatchEvent = vi.fn();
    const connect = vi.fn();
    const scheduleReconnect = vi.fn((_delayMs: number, task: () => void) => {
      task();
    });
    const reportCloseFailure = vi.fn();

    executeTransportClosePlan(
      {
        closeIntent: "normal",
        closeCode: 1006,
        reconnectAttempt: 1,
        shouldReportCloseFailure: true,
      },
      {
        dispatchEvent,
        connect,
        scheduleReconnect,
        reportCloseFailure,
      },
    );

    expect(reportCloseFailure).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledWith({
      type: "schedule-reconnect",
      attempt: 2,
    });
    expect(scheduleReconnect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
