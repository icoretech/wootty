import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NoticeDetails } from "../../../../../src/features/terminal/notifications/notice-contract";
import { toUserNotice } from "../../../../../src/features/terminal/notifications/user-notice";
import type { TerminalClientMessage } from "../../../../../src/features/terminal/protocol/terminal-wire-schema";

vi.mock(
  "../../../../../src/features/terminal/app/engine/runtime/connection-input-backpressure",
  () => ({
    useConnectionInputBackpressure: vi.fn(),
  }),
);
vi.mock(
  "../../../../../src/features/terminal/app/engine/runtime/runtime-orchestrator",
  () => ({
    useRuntimeOrchestrator: vi.fn(),
  }),
);

import { useConnectionInputBackpressure } from "../../../../../src/features/terminal/app/engine/runtime/connection-input-backpressure";
import { useConnectionRuntimeIoBridge } from "../../../../../src/features/terminal/app/engine/runtime/connection-runtime-io-bridge";
import { useRuntimeOrchestrator } from "../../../../../src/features/terminal/app/engine/runtime/runtime-orchestrator";

describe("connection runtime io bridge", () => {
  const mockedBackpressureHook = vi.mocked(useConnectionInputBackpressure);
  const mockedRuntimeHook = vi.mocked(useRuntimeOrchestrator);

  const backpressureState = {
    runtimeFitSizeRef: { current: { cols: 80, rows: 24 } },
    queuedInputBytes: 7,
    droppedInputBytes: 2,
    sendResize: vi.fn<(cols: number, rows: number) => void>(),
    flushPendingResize: vi.fn<() => void>(),
    handleRuntimeInput: vi.fn<(data: string) => void>(),
    flushQueuedInput: vi.fn<() => void>(),
    resetQueuedBuffers: vi.fn<() => void>(),
  };

  const runtimeState = {
    terminalElementRef: { current: null as HTMLDivElement | null },
    terminalReady: true,
    clearTerminal: vi.fn<() => void>(),
    readTranscript: vi.fn<() => string>(() => "buffer output"),
    writeOutput: vi.fn<(data: string) => number>(),
    writeExit: vi.fn<(code: number, signal: number) => void>(),
    writeServerError: vi.fn<(message: string) => void>(),
    updateFontSize: vi.fn<(fontSize: number, onResized: () => void) => void>(),
    fitAndSyncSize:
      vi.fn<(onResize: (cols: number, rows: number) => void) => void>(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeState.writeOutput.mockImplementation((data) => data.length);
    runtimeState.fitAndSyncSize.mockImplementation((onResize) => {
      onResize(132, 41);
    });
    mockedBackpressureHook.mockReturnValue(backpressureState);
    mockedRuntimeHook.mockReturnValue(runtimeState);
  });

  it("wires backpressure/runtime hooks and tracks io counters", () => {
    const sendNow = vi.fn((_payload: TerminalClientMessage) => true);
    const publishSessionNotice = vi.fn();
    const publishNotice = (details: NoticeDetails) => {
      publishSessionNotice(toUserNotice(details));
    };
    const onRuntimeBootError = vi.fn();

    const { result } = renderHook(() => {
      return useConnectionRuntimeIoBridge({
        documentRef: document,
        loadRuntime: async () => {
          throw new Error("unused in mocked runtime hook");
        },
        initialFontSize: 12,
        attachMode: "control",
        sendNow,
        publishNotice,
        onRuntimeBootError,
      });
    });

    expect(mockedBackpressureHook).toHaveBeenCalledWith({
      attachMode: "control",
      sendNow,
    });
    expect(result.current.terminalReady).toBe(true);
    expect(result.current.queuedInputBytes).toBe(7);
    expect(result.current.droppedInputBytes).toBe(2);
    expect(result.current.runtimeFitSizeRef.current).toEqual({
      cols: 80,
      rows: 24,
    });

    const runtimeArgs = mockedRuntimeHook.mock.calls[0]?.[0];
    expect(runtimeArgs).toBeDefined();
    if (!runtimeArgs) {
      return;
    }

    act(() => {
      runtimeArgs.onInput("hello");
    });
    expect(backpressureState.handleRuntimeInput).toHaveBeenCalledWith("hello");

    act(() => {
      result.current.writeOutputAndTrackBytes("abc");
      result.current.writeOutputAndTrackBytes("defgh");
    });
    expect(runtimeState.writeOutput).toHaveBeenCalledTimes(2);
    expect(result.current.outputBytes).toBe(8);

    act(() => {
      result.current.fitAndSyncSize();
    });
    expect(runtimeState.fitAndSyncSize).toHaveBeenCalledTimes(1);
    expect(backpressureState.sendResize).toHaveBeenCalledWith(132, 41);

    act(() => {
      result.current.flushAfterReady();
    });
    expect(backpressureState.flushQueuedInput).toHaveBeenCalledTimes(1);
    expect(backpressureState.flushPendingResize).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.resetRuntimeBuffers();
    });
    expect(runtimeState.clearTerminal).toHaveBeenCalledTimes(1);
    expect(backpressureState.resetQueuedBuffers).toHaveBeenCalledTimes(1);
    expect(result.current.outputBytes).toBe(0);
    expect(result.current.readTranscript()).toBe("buffer output");

    const bootError = new Error("loader exploded");
    act(() => {
      runtimeArgs.onBootError({
        reason: "loader exploded",
        cause: bootError,
      });
    });
    expect(publishSessionNotice).toHaveBeenCalledWith(
      toUserNotice({
        context: "runtime",
        reason: "loader exploded",
        cause: bootError,
      }),
    );
    expect(onRuntimeBootError).toHaveBeenCalledTimes(1);
  });
});
