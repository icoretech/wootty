import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectionStatus } from "../../contracts/connection";
import type { AttachMode } from "../../contracts/session";
import type {
  TerminalTransport,
  TerminalTransportFailureCode,
  TerminalTransportMessageEvent,
} from "../../contracts/transport";
import type { NoticePublisher } from "../../notifications/notice-contract";
import type { Scheduler } from "../../platform/scheduler";
import { createAttachMessage } from "../../protocol/terminal-client-messages";
import type { TerminalClientMessage } from "../../protocol/terminal-wire-schema";
import type { TerminalRuntime } from "../../runtime/xterm-runtime-contract";
import type { SessionRefreshResult } from "../../session/application/session-refresh-result";
import { useConnectionMessageGateway } from "./connection-message-gateway";
import { useConnectionRuntimeIoBridge } from "./connection-runtime-io-bridge";
import {
  type ConnectionStatusFlag,
  projectConnectionStatus,
  shouldClearStatusOverride,
} from "./connection-status-projector";
import { useTransportOrchestrator } from "./transport-orchestrator";

type UseConnectionCoordinatorArgs = {
  createTransport: (url: string) => TerminalTransport;
  loadRuntime: () => Promise<TerminalRuntime>;
  wsUrl: string;
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
  refreshLiveSessions: (requestId?: number) => Promise<SessionRefreshResult>;
  scheduler: Scheduler;
};

type ConnectionCoordinatorState = {
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
  refreshLiveSessions,
  scheduler,
}: UseConnectionCoordinatorArgs): ConnectionCoordinatorState {
  const sendPayloadRef = useRef<(payload: TerminalClientMessage) => boolean>(
    () => false,
  );
  const markPongRef = useRef<() => void>(() => {
    // no-op
  });
  const hasSessionContextRef = useRef(hasActiveSession);
  const [statusFlag, setStatusFlag] = useState<ConnectionStatusFlag | null>(
    null,
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
    setStatusFlag("runtime_error");
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

  const reportSocketFailure = useCallback(
    (
      source: "error" | "close",
      code?: TerminalTransportFailureCode,
      reason?: string,
    ) => {
      publishNotice({
        context: "transport",
        source,
        code,
        reason,
      });
    },
    [publishNotice],
  );

  const { handleSocketMessage } = useConnectionMessageGateway({
    publishNotice,
    setStatusFlag,
    applyReadySession,
    clearMissingSession,
    refreshLiveSessions,
    setSessionMode,
    writeServerError: runtimeBridge.writeServerError,
    flushAfterReady: runtimeBridge.flushAfterReady,
    writeOutputAndTrackBytes: runtimeBridge.writeOutputAndTrackBytes,
    writeExit: runtimeBridge.writeExit,
    markPong: () => {
      markPongRef.current();
    },
  });

  const transportHandlers = useMemo(
    () => ({
      onOpen: () => {
        setStatusFlag(null);
        const fitSize = runtimeBridge.runtimeFitSizeRef.current;
        const attachSent = sendNow(
          createAttachMessage({
            sessionId,
            cols: fitSize.cols,
            rows: fitSize.rows,
            watch: attachMode === "watch",
          }),
        );
        if (attachSent) {
          return;
        }
        publishNotice({
          context: "transport",
          reason: "attach handshake send failed",
        });
      },
      onMessage: (event: TerminalTransportMessageEvent) => {
        if (event.malformed) {
          publishNotice({
            context: "protocol",
            reason: "malformed_transport_event",
            details: event.malformed,
          });
          return;
        }
        handleSocketMessage(event.data);
      },
    }),
    [
      attachMode,
      handleSocketMessage,
      publishNotice,
      runtimeBridge,
      sendNow,
      sessionId,
    ],
  );

  const transport = useTransportOrchestrator({
    createTransport,
    wsUrl,
    handlers: transportHandlers,
    hasSessionContext,
    onSocketFailure: reportSocketFailure,
    scheduler,
  });
  const {
    connect,
    dispose,
    sendPayload,
    markPong,
    reconnectNow: reconnectTransportNow,
    scheduleFreshConnection: scheduleFreshTransportConnection,
    status: transportStatus,
    reconnectAttempt,
    latencyMs,
    lastSocketFailure,
  } = transport;
  sendPayloadRef.current = sendPayload;
  markPongRef.current = markPong;

  const reconnectNow = useCallback(() => {
    setStatusFlag(null);
    reconnectTransportNow();
  }, [reconnectTransportNow]);

  const scheduleFreshConnection = useCallback(() => {
    setStatusFlag(null);
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

  useEffect(() => {
    if (shouldClearStatusOverride(statusFlag, transportStatus)) {
      setStatusFlag(null);
    }
  }, [statusFlag, transportStatus]);

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
      status: projectConnectionStatus(statusFlag, transportStatus),
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
