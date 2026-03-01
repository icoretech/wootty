import { describe, expect, it } from "vitest";
import {
  initialTransportState,
  reduceTransportState,
} from "../../../../../src/features/terminal/app/engine/transport/state/transport-state-machine";

describe("transport state machine", () => {
  it("tracks reconnect scheduling and reset on open", () => {
    const reconnecting = reduceTransportState(initialTransportState, {
      type: "schedule-reconnect",
      attempt: 2,
    });
    expect(reconnecting.status).toBe("reconnecting");
    expect(reconnecting.reconnectAttempt).toBe(2);

    const connected = reduceTransportState(reconnecting, { type: "connected" });
    expect(connected.status).toBe("connected");
    expect(connected.reconnectAttempt).toBe(0);
  });

  it("records socket failures", () => {
    const failed = reduceTransportState(initialTransportState, {
      type: "socket-failure",
      context: {
        source: "close",
        code: 4100,
        reasonCode: "socket_failure",
        technicalDetail: "reset",
      },
    });

    expect(failed.lastSocketFailure).toMatchObject({
      source: "close",
      code: 4100,
    });
  });
});
