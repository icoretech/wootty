import type { RefObject } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ConnectionStatus } from "../../contracts/connection";
import type {
  TerminalTransport,
  TerminalTransportMessageEvent,
} from "../../contracts/transport/transport";
import type { Scheduler } from "../../platform/scheduler";
import { createAttachMessage } from "../../protocol/terminal-client-messages";
import type { TerminalClientMessage } from "../../protocol/terminal-wire-schema";
import type { TerminalRuntime } from "../../runtime/xterm-runtime-contract";
import type { SessionOrchestratorInterface } from "../../session/application/session-orchestrator";
import { useConnectionMessageGateway } from "./protocol/connection-message-gateway";
import {
  type ConnectionStatusFlag,
  initialConnectionStatusState,
  reduceConnectionStatusState,
} from "./protocol/connection-status-projector";
import { useConnectionRuntimeIoBridge } from "./runtime/connection-runtime-io-bridge";
import type { TransportFailureSink } from "./transport/contracts/transport-failure-contract";
import {
  type TransportLifecycleContext,
  TransportLifecycleService,
} from "./transport/lifecycle/transport-lifecycle-service";
import {
  initialTransportState,
  reduceTransportState,
  type TransportEvent,
  type TransportFailureContext,
} from "./transport/state/transport-state-machine";

type UseConnectionCoordinatorArgs = {
  transport: {
    createTransport: (url: string) => TerminalTransport;
    wsUrl: string | null;
    transportEnabled: boolean;
    bootstrapFailure: boolean;
    scheduler: Scheduler;
  };
  runtime: {
    loadRuntime: () => Promise<TerminalRuntime>;
    documentRef: Document | null;
    initialFontSize: number;
  };
  session: SessionOrchestratorInterface;
};

type ConnectionCoordinatorState = {
  runtime: {
    terminalElementRef: RefObject<HTMLDivElement | null>;
    terminalReady: boolean;
    clearTerminal: () => void;
    readTranscript: () => string;
    updateFontSize: (fontSize: number, onResized: () => void) => void;
    fitAndSyncSize: () => void;
    resetRuntimeBuffers: () => void;
  };
  transport: {
    status: ConnectionStatus;
    reconnectAttempt: number;
    latencyMs: number | null;
    lastSocketFailure: TransportFailureContext | null;
    reconnectNow: () => void;
    scheduleFreshConnection: () => void;
    sendNow: (payload: TerminalClientMessage) => boolean;
  };
  telemetry: {
    outputBytes: number;
    queuedInputBytes: number;
    droppedInputBytes: number;
  };
};

export function useConnectionCoordinator({
  transport,
  runtime,
  session,
}: UseConnectionCoordinatorArgs): ConnectionCoordinatorState {
  const {
    createTransport,
    wsUrl,
    transportEnabled,
    bootstrapFailure,
    scheduler,
  } = transport;
  const { loadRuntime, documentRef, initialFontSize } = runtime;
  const {
    sessionId,
    attachMode,
    hasActiveSession,
    setSessionMode,
    applyReadySession,
    clearMissingSession,
    requestTransportRefresh,
    publishNotice,
  } = session;
  const sendPayloadRef = useRef<(payload: TerminalClientMessage) => boolean>(
    () => false,
  );
  const markPongRef = useRef<() => void>(() => {
    // no-op
  });
  const [statusState, dispatchStatusEvent] = useReducer(
    reduceConnectionStatusState,
    initialConnectionStatusState,
  );

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
  const {
    clearTerminal,
    droppedInputBytes,
    fitAndSyncSize,
    flushAfterReady,
    outputBytes,
    queuedInputBytes,
    readTranscript,
    resetRuntimeBuffers,
    runtimeFitSizeRef,
    terminalElementRef,
    terminalReady,
    updateFontSize,
    writeExit,
    writeOutputAndTrackBytes,
    writeServerError,
  } = runtimeBridge;
  const setStatusFlag = useCallback((next: ConnectionStatusFlag | null) => {
    dispatchStatusEvent({
      type: "status-flag",
      flag: next,
    });
  }, []);
  const reportSocketFailure = useCallback<TransportFailureSink>(
    ({ source, code, reasonCode, technicalDetail, cause, noticeMessage }) => {
      publishNotice({
        context: "transport",
        source,
        reasonCode: reasonCode ?? "socket_failure",
        code,
        debugDetail: technicalDetail,
        noticeMessage,
        cause,
      });
    },
    [publishNotice],
  );
  const { handleSocketMessage } = useConnectionMessageGateway({
    session: {
      publishNotice,
      applyReadySession,
      clearMissingSession,
      requestTransportRefresh,
      setSessionMode,
    },
    runtime: {
      writeServerError: writeServerError,
      flushAfterReady: flushAfterReady,
      writeOutputAndTrackBytes: writeOutputAndTrackBytes,
      writeExit: writeExit,
    },
    transport: {
      setStatusFlag,
      markPong: () => {
        markPongRef.current();
      },
    },
  });
  const transportHandlers = useMemo(
    () => ({
      onOpen: () => {
        setStatusFlag(null);
        const fitSize = runtimeFitSizeRef.current;
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
          reasonCode: "attach_handshake_send_failed",
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
      runtimeFitSizeRef,
      sendNow,
      sessionId,
      setStatusFlag,
    ],
  );
  const [transportState, setTransportState] = useState(initialTransportState);
  const transportStateRef = useRef(initialTransportState);
  const dispatchTransportEvent = useCallback((event: TransportEvent) => {
    const nextState = reduceTransportState(transportStateRef.current, event);
    transportStateRef.current = nextState;
    setTransportState(nextState);
  }, []);
  const runtimeContext = useMemo<TransportLifecycleContext>(() => {
    return {
      wsUrl,
      handlers: transportHandlers,
      hasSessionContext: hasActiveSession,
      onSocketFailure: reportSocketFailure,
    };
  }, [hasActiveSession, reportSocketFailure, transportHandlers, wsUrl]);
  const transportLifecycle = useMemo(() => {
    return new TransportLifecycleService({
      createTransport,
      scheduler,
      runtime: {
        wsUrl: null,
        handlers: { onOpen: () => undefined, onMessage: () => undefined },
        hasSessionContext: false,
        onSocketFailure: () => undefined,
      },
      getState: () => transportStateRef.current,
      dispatchEvent: dispatchTransportEvent,
    });
  }, [createTransport, dispatchTransportEvent, scheduler]);

  useEffect(() => {
    transportLifecycle.updateRuntime(runtimeContext);
  }, [runtimeContext, transportLifecycle]);

  const {
    connect,
    dispose,
    sendPayload,
    markPong,
    reconnectNow: reconnectTransportNow,
    reconnectWithEndpointChange,
    scheduleFreshConnection: scheduleFreshTransportConnection,
  } = transportLifecycle;
  useLayoutEffect(() => {
    sendPayloadRef.current = sendPayload;
    markPongRef.current = markPong;
  }, [sendPayload, markPong]);

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
    if (!terminalReady || !transportEnabled) {
      return;
    }
    connect();
    return () => {
      dispose();
    };
  }, [connect, dispose, terminalReady, transportEnabled]);

  const previousWsUrlRef = useRef<string | null>(wsUrl);
  useEffect(() => {
    if (!terminalReady || !transportEnabled) {
      previousWsUrlRef.current = wsUrl;
      return;
    }
    if (previousWsUrlRef.current === wsUrl) {
      return;
    }
    previousWsUrlRef.current = wsUrl;
    reconnectWithEndpointChange();
  }, [reconnectWithEndpointChange, terminalReady, transportEnabled, wsUrl]);

  useEffect(() => {
    dispatchStatusEvent({
      type: "transport-status",
      status: transportState.status,
    });
  }, [transportState.status]);

  return {
    runtime: {
      terminalElementRef: terminalElementRef,
      terminalReady: terminalReady,
      clearTerminal: clearTerminal,
      readTranscript: readTranscript,
      updateFontSize: updateFontSize,
      fitAndSyncSize: fitAndSyncSize,
      resetRuntimeBuffers: resetRuntimeBuffers,
    },
    transport: {
      status: bootstrapFailure ? "error" : statusState.status,
      reconnectAttempt: transportState.reconnectAttempt,
      latencyMs: transportState.latencyMs,
      lastSocketFailure: transportState.lastSocketFailure,
      reconnectNow,
      scheduleFreshConnection,
      sendNow,
    },
    telemetry: {
      outputBytes: outputBytes,
      queuedInputBytes: queuedInputBytes,
      droppedInputBytes: droppedInputBytes,
    },
  };
}
