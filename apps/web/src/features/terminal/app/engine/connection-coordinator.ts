import type { RefObject } from "react";
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ConnectionStatus } from "../../contracts/connection";
import type { AttachMode } from "../../contracts/session/session";
import type { TerminalTransport } from "../../contracts/transport/transport";
import type { NoticePublisher } from "../../notifications/notice-contract";
import type { Scheduler } from "../../platform/scheduler";
import type { TerminalClientMessage } from "../../protocol/terminal-wire-schema";
import type { TerminalRuntime } from "../../runtime/xterm-runtime-contract";
import type { SessionRefreshResult } from "../../session/application/session-refresh-result";
import { useConnectionTransportCapability } from "./connection-transport-capability";
import {
  type ConnectionStatusFlag,
  initialConnectionStatusState,
  reduceConnectionStatusState,
} from "./protocol/connection-status-projector";
import { useConnectionRuntimeIoBridge } from "./runtime/connection-runtime-io-bridge";

type UseConnectionCoordinatorArgs = {
  createTransport: (url: string) => TerminalTransport;
  loadRuntime: () => Promise<TerminalRuntime>;
  wsUrl: string | null;
  documentRef: Document | null;
  initialFontSize: number;
  sessionId: string | null;
  attachMode: AttachMode;
  hasActiveSession: boolean;
  transportEnabled: boolean;
  publishNotice: NoticePublisher;
  setSessionMode: (mode: AttachMode) => void;
  applyReadySession: (nextSessionId: string, readOnly: boolean) => void;
  clearMissingSession: () => void;
  requestTransportRefresh: () => Promise<SessionRefreshResult>;
  scheduler: Scheduler;
};

export type ConnectionCoordinatorState = {
  runtime: {
    terminalElementRef: RefObject<HTMLDivElement | null>;
    terminalReady: boolean;
    clearTerminal: () => void;
    updateFontSize: (fontSize: number, onResized: () => void) => void;
    fitAndSyncSize: () => void;
    resetRuntimeBuffers: () => void;
  };
  transport: {
    status: ConnectionStatus;
    reconnectAttempt: number;
    latencyMs: number | null;
    lastSocketFailure: string;
    reconnectNow: () => void;
    scheduleFreshConnection: () => void;
  };
  telemetry: {
    outputBytes: number;
    queuedInputBytes: number;
    droppedInputBytes: number;
  };
};

export function useConnectionCoordinator({
  createTransport,
  loadRuntime,
  wsUrl,
  documentRef,
  initialFontSize,
  sessionId,
  attachMode,
  hasActiveSession,
  transportEnabled,
  publishNotice,
  setSessionMode,
  applyReadySession,
  clearMissingSession,
  requestTransportRefresh,
  scheduler,
}: UseConnectionCoordinatorArgs): ConnectionCoordinatorState {
  const sendPayloadRef = useRef<(payload: TerminalClientMessage) => boolean>(
    () => false,
  );
  const markPongRef = useRef<() => void>(() => {
    // no-op
  });
  const hasSessionContextRef = useRef(hasActiveSession);
  const [statusState, dispatchStatusEvent] = useReducer(
    reduceConnectionStatusState,
    initialConnectionStatusState,
  );

  useEffect(() => {
    hasSessionContextRef.current = hasActiveSession;
  }, [hasActiveSession]);

  const hasSessionContext = useCallback(() => {
    return hasSessionContextRef.current;
  }, []);

  const sendNow = useCallback((payload: TerminalClientMessage): boolean => {
    return sendPayloadRef.current(payload);
  }, []);
  const handleRuntimeBootError = useCallback(() => {
    dispatchStatusEvent({
      type: "status-flag",
      flag: "runtime_error",
    });
  }, []);

  const runtimeBridge = useConnectionRuntimeIoBridge({
    documentRef,
    loadRuntime,
    initialFontSize,
    attachMode,
    sendNow,
    publishNotice,
    onRuntimeBootError: handleRuntimeBootError,
  });
  const setStatusFlag = useCallback((next: ConnectionStatusFlag | null) => {
    dispatchStatusEvent({
      type: "status-flag",
      flag: next,
    });
  }, []);

  const transport = useConnectionTransportCapability({
    createTransport,
    wsUrl,
    attachMode,
    sessionId,
    hasSessionContext,
    publishNotice,
    setStatusFlag,
    setSessionMode,
    applyReadySession,
    clearMissingSession,
    requestTransportRefresh,
    writeServerError: runtimeBridge.writeServerError,
    flushAfterReady: runtimeBridge.flushAfterReady,
    writeOutputAndTrackBytes: runtimeBridge.writeOutputAndTrackBytes,
    writeExit: runtimeBridge.writeExit,
    sendNow,
    runtimeFitSizeRef: runtimeBridge.runtimeFitSizeRef,
    markPongRef,
    scheduler,
  });
  const {
    connect,
    dispose,
    sendPayload,
    markPong,
    reconnectNow: reconnectTransportNow,
    reconnectWithEndpointChange,
    scheduleFreshConnection: scheduleFreshTransportConnection,
    status: transportStatus,
    reconnectAttempt,
    latencyMs,
    lastSocketFailure,
  } = transport;
  sendPayloadRef.current = sendPayload;
  markPongRef.current = markPong;

  const reconnectNow = useCallback(() => {
    dispatchStatusEvent({
      type: "status-flag",
      flag: null,
    });
    reconnectTransportNow();
  }, [reconnectTransportNow]);

  const scheduleFreshConnection = useCallback(() => {
    dispatchStatusEvent({
      type: "status-flag",
      flag: null,
    });
    scheduleFreshTransportConnection();
  }, [scheduleFreshTransportConnection]);

  useEffect(() => {
    if (!runtimeBridge.terminalReady || !transportEnabled) {
      return;
    }
    connect();
    return () => {
      dispose();
    };
  }, [connect, dispose, runtimeBridge.terminalReady, transportEnabled]);

  const previousWsUrlRef = useRef<string | null>(wsUrl);
  useEffect(() => {
    if (!runtimeBridge.terminalReady || !transportEnabled) {
      previousWsUrlRef.current = wsUrl;
      return;
    }
    if (previousWsUrlRef.current === wsUrl) {
      return;
    }
    previousWsUrlRef.current = wsUrl;
    reconnectWithEndpointChange();
  }, [
    reconnectWithEndpointChange,
    runtimeBridge.terminalReady,
    transportEnabled,
    wsUrl,
  ]);

  useEffect(() => {
    dispatchStatusEvent({
      type: "transport-status",
      status: transportStatus,
    });
  }, [transportStatus]);

  return {
    runtime: {
      terminalElementRef: runtimeBridge.terminalElementRef,
      terminalReady: runtimeBridge.terminalReady,
      clearTerminal: runtimeBridge.clearTerminal,
      updateFontSize: runtimeBridge.updateFontSize,
      fitAndSyncSize: runtimeBridge.fitAndSyncSize,
      resetRuntimeBuffers: runtimeBridge.resetRuntimeBuffers,
    },
    transport: {
      status: statusState.status,
      reconnectAttempt,
      latencyMs,
      lastSocketFailure,
      reconnectNow,
      scheduleFreshConnection,
    },
    telemetry: {
      outputBytes: runtimeBridge.outputBytes,
      queuedInputBytes: runtimeBridge.queuedInputBytes,
      droppedInputBytes: runtimeBridge.droppedInputBytes,
    },
  };
}
