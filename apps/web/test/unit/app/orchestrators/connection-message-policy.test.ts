import { describe, expect, it, vi } from "vitest";
import {
  handleIncomingServerMessage,
  handleServerErrorPolicy,
} from "../../../../src/features/terminal/app/engine/connection-message-policy";

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

  it("keeps unknown raw server error codes non-fatal by policy", () => {
    const onSessionNotFound = vi.fn();
    const onAttachForbidden = vi.fn();
    const onIncompatibleVersion = vi.fn();
    const onAttachRequired = vi.fn();
    const onReadOnlyForbidden = vi.fn();
    const onSessionNotWritable = vi.fn();
    const onSessionNotResizable = vi.fn();
    const onUnknownCode = vi.fn();
    const onMissingCode = vi.fn();

    handleServerErrorPolicy({
      rawCode: "custom_error",
      onSessionNotFound,
      onAttachForbidden,
      onIncompatibleVersion,
      onAttachRequired,
      onReadOnlyForbidden,
      onSessionNotWritable,
      onSessionNotResizable,
      onUnknownCode,
      onMissingCode,
    });

    expect(onUnknownCode).toHaveBeenCalledWith("custom_error");
    expect(onMissingCode).not.toHaveBeenCalled();
    expect(onSessionNotFound).not.toHaveBeenCalled();
    expect(onAttachForbidden).not.toHaveBeenCalled();
    expect(onIncompatibleVersion).not.toHaveBeenCalled();
    expect(onAttachRequired).not.toHaveBeenCalled();
    expect(onReadOnlyForbidden).not.toHaveBeenCalled();
    expect(onSessionNotWritable).not.toHaveBeenCalled();
    expect(onSessionNotResizable).not.toHaveBeenCalled();
  });

  it("maps known and unhandled server error branches explicitly", () => {
    const onSessionNotFound = vi.fn();
    const onAttachForbidden = vi.fn();
    const onIncompatibleVersion = vi.fn();
    const onAttachRequired = vi.fn();
    const onReadOnlyForbidden = vi.fn();
    const onSessionNotWritable = vi.fn();
    const onSessionNotResizable = vi.fn();
    const onUnknownCode = vi.fn();
    const onMissingCode = vi.fn();

    handleServerErrorPolicy({
      code: "attach_forbidden",
      onSessionNotFound,
      onAttachForbidden,
      onIncompatibleVersion,
      onAttachRequired,
      onReadOnlyForbidden,
      onSessionNotWritable,
      onSessionNotResizable,
      onUnknownCode,
      onMissingCode,
    });
    handleServerErrorPolicy({
      code: "read_only_forbidden",
      onSessionNotFound,
      onAttachForbidden,
      onIncompatibleVersion,
      onAttachRequired,
      onReadOnlyForbidden,
      onSessionNotWritable,
      onSessionNotResizable,
      onUnknownCode,
      onMissingCode,
    });
    handleServerErrorPolicy({
      onSessionNotFound,
      onAttachForbidden,
      onIncompatibleVersion,
      onAttachRequired,
      onReadOnlyForbidden,
      onSessionNotWritable,
      onSessionNotResizable,
      onUnknownCode,
      onMissingCode,
    });

    expect(onAttachForbidden).toHaveBeenCalledTimes(1);
    expect(onReadOnlyForbidden).toHaveBeenCalledTimes(1);
    expect(onUnknownCode).not.toHaveBeenCalled();
    expect(onMissingCode).toHaveBeenCalledTimes(1);
    expect(onSessionNotFound).not.toHaveBeenCalled();
    expect(onIncompatibleVersion).not.toHaveBeenCalled();
    expect(onAttachRequired).not.toHaveBeenCalled();
    expect(onSessionNotWritable).not.toHaveBeenCalled();
    expect(onSessionNotResizable).not.toHaveBeenCalled();
  });
});
