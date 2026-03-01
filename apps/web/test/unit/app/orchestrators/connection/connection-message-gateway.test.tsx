import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionMessageGateway } from "../../../../../src/features/terminal/app/engine/protocol/connection-message-gateway";
import { handleIncomingServerMessage } from "../../../../../src/features/terminal/app/engine/protocol/connection-message-policy";

vi.mock(
  "../../../../../src/features/terminal/app/engine/protocol/connection-message-policy",
  () => ({
    handleIncomingServerMessage: vi.fn(),
  }),
);

const mockedIncomingHandler = vi.mocked(handleIncomingServerMessage);

function createGatewayArgs() {
  return {
    publishNotice: vi.fn(),
    setStatusFlag: vi.fn(),
    applyReadySession: vi.fn(),
    clearMissingSession: vi.fn(),
    requestTransportRefresh: vi.fn(async () => ({ ok: true as const })),
    setSessionMode: vi.fn(),
    writeServerError: vi.fn(),
    flushAfterReady: vi.fn(),
    writeOutputAndTrackBytes: vi.fn(),
    writeExit: vi.fn(),
    markPong: vi.fn(),
  };
}

describe("connection message gateway", () => {
  beforeEach(() => {
    mockedIncomingHandler.mockReset();
  });

  it("publishes protocol incompatibility notices and flags the status", () => {
    const args = createGatewayArgs();
    mockedIncomingHandler.mockImplementation(({ onProtocolFailure }) => {
      onProtocolFailure({
        reason: "incompatible_version",
      });
    });

    const { result } = renderHook(() => useConnectionMessageGateway(args));

    act(() => {
      result.current.handleSocketMessage("{}");
    });

    expect(args.publishNotice).toHaveBeenCalledWith({
      context: "protocol",
      reason: "incompatible_version",
    });
    expect(args.setStatusFlag).toHaveBeenCalledWith("protocol_incompatible");
  });

  it("flushes runtime and refreshes sessions after ready events", () => {
    const args = createGatewayArgs();
    mockedIncomingHandler.mockImplementation(({ onReady }) => {
      onReady({
        type: "ready",
        sessionId: "session-1",
        readOnly: false,
        version: 1,
      });
    });

    const { result } = renderHook(() => useConnectionMessageGateway(args));

    act(() => {
      result.current.handleSocketMessage("{}");
    });

    expect(args.applyReadySession).toHaveBeenCalledWith("session-1", false);
    expect(args.setStatusFlag).toHaveBeenCalledWith(null);
    expect(args.flushAfterReady).toHaveBeenCalledOnce();
    expect(args.requestTransportRefresh).toHaveBeenCalledOnce();
  });

  it("maps known server errors through policy callbacks", () => {
    const args = createGatewayArgs();
    mockedIncomingHandler.mockImplementation(({ onServerError }) => {
      onServerError({
        type: "error",
        message: "session vanished",
        code: "session_not_found",
      });
    });

    const { result } = renderHook(() => useConnectionMessageGateway(args));

    act(() => {
      result.current.handleSocketMessage("{}");
    });

    expect(args.writeServerError).toHaveBeenCalledWith("session vanished");
    expect(args.publishNotice).toHaveBeenCalledWith({
      context: "server",
      reason: "session_not_found",
    });
    expect(args.clearMissingSession).toHaveBeenCalledOnce();
    expect(args.setStatusFlag).toHaveBeenCalledWith("session_not_found");
    expect(args.requestTransportRefresh).toHaveBeenCalledOnce();
  });
});
