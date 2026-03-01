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

  it("records socket failures and close intent", () => {
    const withIntent = reduceTransportState(initialTransportState, {
      type: "set-close-intent",
      intent: "manual",
    });
    const failed = reduceTransportState(withIntent, {
      type: "socket-failure",
      context: "close code=4100 reason=reset",
    });

    expect(failed.closeIntent).toBe("manual");
    expect(failed.lastSocketFailure).toContain("code=4100");
  });
});
