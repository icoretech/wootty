import { describe, expect, it, vi } from "vitest";
import type { TransportFailure } from "../../../../../src/features/terminal/app/engine/transport/contracts/transport-failure-contract";
import { TransportSocketReliabilityCoordinator } from "../../../../../src/features/terminal/app/engine/transport/reliability/transport-socket-reliability-coordinator";
import {
  reconnectDelayMs,
  TERMINAL_CLOSE_CODE,
  TERMINAL_HEARTBEAT_MS,
} from "../../../../../src/features/terminal/app/engine/transport/state/transport-policy";
import type { TransportEvent } from "../../../../../src/features/terminal/app/engine/transport/state/transport-state-machine";
import { FakeScheduler } from "../../../../support/harness/fake-scheduler";

function createHarness({
  reconnectAttempt = 0,
}: {
  reconnectAttempt?: number;
} = {}) {
  const scheduler = new FakeScheduler();
  const events: TransportEvent[] = [];
  const onSocketFailure = vi.fn<(failure: TransportFailure) => void>();
  const connect = vi.fn();
  const sendPing = vi.fn();
  const closeActive = vi.fn().mockReturnValue(true);
  let attempt = reconnectAttempt;

  const coordinator = new TransportSocketReliabilityCoordinator({
    scheduler,
    dispatchEvent: (event) => {
      events.push(event);
    },
    onSocketFailure,
    connect,
    getReconnectAttempt: () => attempt,
    sendPing,
    closeActive,
  });

  return {
    coordinator,
    scheduler,
    events,
    onSocketFailure,
    connect,
    sendPing,
    closeActive,
    setReconnectAttempt: (next: number) => {
      attempt = next;
    },
  };
}

describe("transport socket reliability coordinator", () => {
  it("runs heartbeat ping/timeout lifecycle after connect", () => {
    const harness = createHarness();

    harness.coordinator.onConnected();
    harness.scheduler.advanceBy(TERMINAL_HEARTBEAT_MS.INTERVAL);
    expect(harness.sendPing).toHaveBeenCalledTimes(1);

    harness.scheduler.advanceBy(TERMINAL_HEARTBEAT_MS.PONG_TIMEOUT);
    expect(harness.closeActive).toHaveBeenCalledWith(
      TERMINAL_CLOSE_CODE.PONG_TIMEOUT,
      "pong timeout",
    );
  });

  it("reports send failures through socket failure sink and socket-error event", () => {
    const harness = createHarness();
    const failureCause = new Error("send exploded");

    harness.coordinator.reportSendFailure(failureCause);

    expect(harness.onSocketFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "error",
        reasonCode: "send_failed",
        technicalDetail: "send exploded",
        cause: failureCause,
      }),
    );
    expect(harness.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["socket-failure", "socket-error"]),
    );
  });

  it("suppresses duplicate close failure notices after socket-error on same generation", () => {
    const harness = createHarness();

    harness.coordinator.handleSocketError(5, {
      source: "transport",
      message: "socket exploded",
    });
    harness.coordinator.handleSocketClose({
      closeIntent: "normal",
      closeCode: 1006,
      closeReason: "abnormal closure",
      socketGeneration: 5,
    });

    expect(harness.onSocketFailure).toHaveBeenCalledTimes(1);
    expect(harness.events).toContainEqual({
      type: "schedule-reconnect",
      attempt: 1,
    });

    harness.scheduler.advanceBy(reconnectDelayMs(0));
    expect(harness.connect).toHaveBeenCalledTimes(1);
  });

  it("reports close failures when there was no prior socket-error for generation", () => {
    const harness = createHarness({ reconnectAttempt: 1 });

    harness.coordinator.handleSocketClose({
      closeIntent: "normal",
      closeCode: 1006,
      closeReason: "abnormal closure",
      socketGeneration: 12,
    });

    expect(harness.onSocketFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "close",
        reasonCode: "socket_failure",
        technicalDetail: "abnormal closure",
      }),
    );
    expect(harness.events).toContainEqual({
      type: "schedule-reconnect",
      attempt: 2,
    });
  });

  it("reports bootstrap failures as socket-error conditions", () => {
    const harness = createHarness();

    harness.coordinator.reportBootstrapFailure(
      "endpoint_invalid_format",
      "invalid websocket endpoint",
    );

    expect(harness.onSocketFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "error",
        reasonCode: "endpoint_invalid_format",
        technicalDetail: "invalid websocket endpoint",
      }),
    );
    expect(harness.events).toContainEqual({ type: "socket-error" });
  });
});
