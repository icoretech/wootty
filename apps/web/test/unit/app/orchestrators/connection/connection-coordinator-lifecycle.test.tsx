import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionCoordinator } from "../../../../../src/features/terminal/app/engine/connection-coordinator";
import { browserScheduler } from "../../../../../src/features/terminal/platform/scheduler";
import { FakeScheduler } from "../../../../support/harness/fake-scheduler";
import { FakeTransport } from "../../../../support/harness/fake-transport";

let runtimeBridgeMock: {
  terminalElementRef: { current: HTMLDivElement | null };
  terminalReady: boolean;
  runtimeFitSizeRef: { current: { cols: number; rows: number } };
  outputBytes: number;
  queuedInputBytes: number;
  droppedInputBytes: number;
  clearTerminal: ReturnType<typeof vi.fn>;
  readTranscript: ReturnType<typeof vi.fn>;
  updateFontSize: ReturnType<typeof vi.fn>;
  fitAndSyncSize: ReturnType<typeof vi.fn>;
  flushAfterReady: ReturnType<typeof vi.fn>;
  writeOutputAndTrackBytes: ReturnType<typeof vi.fn>;
  writeExit: ReturnType<typeof vi.fn>;
  writeServerError: ReturnType<typeof vi.fn>;
  resetRuntimeBuffers: ReturnType<typeof vi.fn>;
};

const handleSocketMessage = vi.fn();

vi.mock(
  "../../../../../src/features/terminal/app/engine/runtime/connection-runtime-io-bridge",
  () => ({
    useConnectionRuntimeIoBridge: () => runtimeBridgeMock,
  }),
);

vi.mock(
  "../../../../../src/features/terminal/app/engine/protocol/connection-message-gateway",
  () => ({
    useConnectionMessageGateway: () => ({
      handleSocketMessage,
    }),
  }),
);

function buildRuntimeBridgeMock() {
  return {
    terminalElementRef: { current: null },
    terminalReady: true,
    runtimeFitSizeRef: { current: { cols: 80, rows: 24 } },
    outputBytes: 0,
    queuedInputBytes: 0,
    droppedInputBytes: 0,
    clearTerminal: vi.fn(),
    readTranscript: vi.fn(() => ""),
    updateFontSize: vi.fn(),
    fitAndSyncSize: vi.fn(),
    flushAfterReady: vi.fn(),
    writeOutputAndTrackBytes: vi.fn(),
    writeExit: vi.fn(),
    writeServerError: vi.fn(),
    resetRuntimeBuffers: vi.fn(),
  };
}

describe("connection coordinator lifecycle", () => {
  beforeEach(() => {
    runtimeBridgeMock = buildRuntimeBridgeMock();
    handleSocketMessage.mockReset();
  });

  it("reconnects transport when ws endpoint changes", async () => {
    const sockets: FakeTransport[] = [];
    const createTransport = vi.fn((_url: string) => {
      const socket = new FakeTransport();
      sockets.push(socket);
      return socket;
    });

    const { rerender } = renderHook(
      ({ wsUrl }: { wsUrl: string }) => {
        return useConnectionCoordinator({
          transport: {
            createTransport,
            wsUrl,
            transportEnabled: true,
            bootstrapFailure: false,
            scheduler: browserScheduler,
          },
          runtime: {
            loadRuntime: vi.fn(async () => {
              throw new Error("loadRuntime should not run in lifecycle mock");
            }),
            documentRef: null,
            initialFontSize: 12,
          },
          session: {
            sessionId: null,
            attachMode: "control",
            hasActiveSession: false,
            setSessionMode: vi.fn(),
            applyReadySession: vi.fn(),
            clearMissingSession: vi.fn(),
            requestTransportRefresh: async () => ({ ok: true }),
            publishNotice: vi.fn(),
          },
        });
      },
      {
        initialProps: {
          wsUrl: "ws://localhost/api/terminal?token=one",
        },
      },
    );

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenNthCalledWith(
      1,
      "ws://localhost/api/terminal?token=one",
    );

    rerender({
      wsUrl: "ws://localhost/api/terminal?token=two",
    });

    await waitFor(() => {
      expect(createTransport).toHaveBeenCalledTimes(2);
    });
    expect(createTransport).toHaveBeenNthCalledWith(
      2,
      "ws://localhost/api/terminal?token=two",
    );
    expect(sockets[0]?.closeCalls).toContainEqual({
      code: 4101,
      reason: "endpoint changed",
    });
  });

  it("disposes transport once on unmount when connected effect owns teardown", () => {
    const sockets: FakeTransport[] = [];
    const createTransport = vi.fn((_url: string) => {
      const socket = new FakeTransport();
      sockets.push(socket);
      return socket;
    });

    const { unmount } = renderHook(() => {
      return useConnectionCoordinator({
        transport: {
          createTransport,
          wsUrl: "ws://localhost/api/terminal",
          transportEnabled: true,
          bootstrapFailure: false,
          scheduler: browserScheduler,
        },
        runtime: {
          loadRuntime: vi.fn(async () => {
            throw new Error("loadRuntime should not run in lifecycle mock");
          }),
          documentRef: null,
          initialFontSize: 12,
        },
        session: {
          sessionId: null,
          attachMode: "control",
          hasActiveSession: false,
          setSessionMode: vi.fn(),
          applyReadySession: vi.fn(),
          clearMissingSession: vi.fn(),
          requestTransportRefresh: async () => ({ ok: true }),
          publishNotice: vi.fn(),
        },
      });
    });

    unmount();

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sockets[0]?.closeCalls).toEqual([
      {
        code: 1000,
        reason: "component unmount",
      },
    ]);
  });

  it("cancels scheduled reconnect work when coordinator unmounts", async () => {
    const scheduler = new FakeScheduler();
    const sockets: FakeTransport[] = [];
    const createTransport = vi.fn((_url: string) => {
      const socket = new FakeTransport();
      sockets.push(socket);
      return socket;
    });

    const { unmount } = renderHook(() => {
      return useConnectionCoordinator({
        transport: {
          createTransport,
          wsUrl: "ws://localhost/api/terminal",
          transportEnabled: true,
          bootstrapFailure: false,
          scheduler,
        },
        runtime: {
          loadRuntime: vi.fn(async () => {
            throw new Error("loadRuntime should not run in lifecycle mock");
          }),
          documentRef: null,
          initialFontSize: 12,
        },
        session: {
          sessionId: null,
          attachMode: "control",
          hasActiveSession: false,
          setSessionMode: vi.fn(),
          applyReadySession: vi.fn(),
          clearMissingSession: vi.fn(),
          requestTransportRefresh: async () => ({ ok: true }),
          publishNotice: vi.fn(),
        },
      });
    });

    expect(sockets).toHaveLength(1);
    sockets[0]?.emitOpen();
    sockets[0]?.emitClose(1006, "network drop");

    await waitFor(() => {
      expect(createTransport).toHaveBeenCalledTimes(1);
    });

    unmount();
    scheduler.advanceBy(10_000);

    expect(createTransport).toHaveBeenCalledTimes(1);
  });
});
