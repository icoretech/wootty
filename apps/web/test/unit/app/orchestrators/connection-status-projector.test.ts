import { describe, expect, it } from "vitest";
import {
  initialConnectionStatusState,
  reduceConnectionStatusState,
} from "../../../../src/features/terminal/app/engine/protocol/connection-status-projector";

describe("connection status reducer", () => {
  it("projects status flags over transport updates in one reducer flow", () => {
    const withRuntimeError = reduceConnectionStatusState(
      initialConnectionStatusState,
      {
        type: "status-flag",
        flag: "runtime_error",
      },
    );
    expect(withRuntimeError.status).toBe("error");

    const withConnectedTransport = reduceConnectionStatusState(
      withRuntimeError,
      {
        type: "transport-status",
        status: "connected",
      },
    );
    expect(withConnectedTransport.statusFlag).toBeNull();
    expect(withConnectedTransport.status).toBe("connected");
  });

  it("keeps remote exit projected as closed while transport remains connected", () => {
    const connected = reduceConnectionStatusState(
      initialConnectionStatusState,
      {
        type: "transport-status",
        status: "connected",
      },
    );
    const remoteExit = reduceConnectionStatusState(connected, {
      type: "status-flag",
      flag: "remote_exit",
    });
    expect(remoteExit.status).toBe("closed");
  });
});
