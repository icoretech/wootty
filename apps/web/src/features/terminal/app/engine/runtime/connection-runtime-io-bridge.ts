import type { MutableRefObject, RefObject } from "react";
import { useCallback, useState } from "react";
import type { AttachMode } from "../../../contracts/session";
import type { NoticePublisher } from "../../../notifications/notice-contract";
import type { TerminalClientMessage } from "../../../protocol/terminal-wire-schema";
import type { TerminalRuntime } from "../../../runtime/xterm-runtime-contract";
import { useConnectionInputBackpressure } from "./connection-input-backpressure";
import { useRuntimeOrchestrator } from "./runtime-orchestrator";

type UseConnectionRuntimeIoBridgeArgs = {
  documentRef: Document | null;
  loadRuntime: () => Promise<TerminalRuntime>;
  initialFontSize: number;
  attachMode: AttachMode;
  sendNow: (payload: TerminalClientMessage) => boolean;
  publishNotice: NoticePublisher;
  onRuntimeBootError: () => void;
};

type ConnectionRuntimeIoBridge = {
  terminalElementRef: RefObject<HTMLDivElement | null>;
  terminalReady: boolean;
  runtimeFitSizeRef: MutableRefObject<{ cols: number; rows: number }>;
  outputBytes: number;
  queuedInputBytes: number;
  droppedInputBytes: number;
  clearTerminal: () => void;
  updateFontSize: (fontSize: number, onResized: () => void) => void;
  fitAndSyncSize: () => void;
  flushAfterReady: () => void;
  writeOutputAndTrackBytes: (data: string) => void;
  writeExit: (code: number, signal: number) => void;
  writeServerError: (message: string) => void;
  resetRuntimeBuffers: () => void;
};

export function useConnectionRuntimeIoBridge({
  documentRef,
  loadRuntime,
  initialFontSize,
  attachMode,
  sendNow,
  publishNotice,
  onRuntimeBootError,
}: UseConnectionRuntimeIoBridgeArgs): ConnectionRuntimeIoBridge {
  const [outputBytes, setOutputBytes] = useState<number>(0);
  const {
    runtimeFitSizeRef,
    queuedInputBytes,
    droppedInputBytes,
    sendResize,
    flushPendingResize,
    handleRuntimeInput,
    flushQueuedInput,
    resetQueuedBuffers,
  } = useConnectionInputBackpressure({
    attachMode,
    sendNow,
  });

  const handleRuntimeBootError = useCallback(
    (reason: string) => {
      publishNotice({
        context: "runtime",
        reason,
      });
      onRuntimeBootError();
    },
    [onRuntimeBootError, publishNotice],
  );

  const runtime = useRuntimeOrchestrator({
    documentRef,
    loadRuntime,
    initialFontSize,
    onInput: handleRuntimeInput,
    onBootError: handleRuntimeBootError,
  });
  const {
    terminalElementRef,
    terminalReady,
    clearTerminal,
    writeOutput,
    writeExit,
    writeServerError,
    updateFontSize,
    fitAndSyncSize: fitRuntimeAndSyncSize,
  } = runtime;

  const fitAndSyncSize = useCallback(() => {
    fitRuntimeAndSyncSize(sendResize);
  }, [fitRuntimeAndSyncSize, sendResize]);

  const flushAfterReady = useCallback(() => {
    flushQueuedInput();
    flushPendingResize();
  }, [flushPendingResize, flushQueuedInput]);

  const writeOutputAndTrackBytes = useCallback(
    (data: string) => {
      const bytes = writeOutput(data);
      setOutputBytes((previous) => previous + bytes);
    },
    [writeOutput],
  );

  const resetRuntimeBuffers = useCallback(() => {
    clearTerminal();
    resetQueuedBuffers();
    setOutputBytes(0);
  }, [clearTerminal, resetQueuedBuffers]);

  return {
    terminalElementRef,
    terminalReady,
    runtimeFitSizeRef,
    outputBytes,
    queuedInputBytes,
    droppedInputBytes,
    clearTerminal,
    updateFontSize,
    fitAndSyncSize,
    flushAfterReady,
    writeOutputAndTrackBytes,
    writeExit,
    writeServerError,
    resetRuntimeBuffers,
  };
}
