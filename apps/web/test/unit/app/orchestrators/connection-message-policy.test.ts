import { describe, expect, it, vi } from "vitest";
import { handleIncomingServerMessage } from "../../../../src/features/terminal/app/engine/connection-message-policy";

describe("connection message policy", () => {
  it("routes incoming server messages to typed handlers", () => {
    const onEmptyPayload = vi.fn();
    const onProtocolFailure = vi.fn();
    const onReady = vi.fn();
    const onOutput = vi.fn();
    const onExit = vi.fn();
    const onServerError = vi.fn();
    const onPong = vi.fn();

    handleIncomingServerMessage({
      rawData: "",
      onEmptyPayload,
      onProtocolFailure,
      onReady,
      onOutput,
      onExit,
      onServerError,
      onPong,
    });
    handleIncomingServerMessage({
      rawData: JSON.stringify({
        type: "ready",
        sessionId: "session-a",
        version: 1,
        readOnly: false,
      }),
      onEmptyPayload,
      onProtocolFailure,
      onReady,
      onOutput,
      onExit,
      onServerError,
      onPong,
    });
    handleIncomingServerMessage({
      rawData: JSON.stringify({ type: "pong" }),
      onEmptyPayload,
      onProtocolFailure,
      onReady,
      onOutput,
      onExit,
      onServerError,
      onPong,
    });

    expect(onEmptyPayload).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith({
      type: "ready",
      sessionId: "session-a",
      readOnly: false,
      version: 1,
    });
    expect(onPong).toHaveBeenCalledTimes(1);
    expect(onProtocolFailure).not.toHaveBeenCalled();
  });
});
