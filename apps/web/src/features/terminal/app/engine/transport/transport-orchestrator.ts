import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type {
  TerminalTransport,
  TerminalTransportFailureCode,
} from "../../../contracts/transport";
import type { Scheduler } from "../../../platform/scheduler";
import type { TerminalClientMessage } from "../../../protocol/terminal-wire-schema";
import {
  type SocketFailureSource,
  type TransportHandlers,
  TransportLifecycleService,
} from "./transport-lifecycle-service";
import {
  initialTransportState,
  reduceTransportState,
  type TransportEvent,
  type TransportState,
} from "./transport-state-machine";

type UseTransportOrchestratorArgs = {
  createTransport: (url: string) => TerminalTransport;
  wsUrl: string | null;
  handlers: TransportHandlers;
  hasSessionContext: () => boolean;
  scheduler: Scheduler;
  onSocketFailure: (
    source: SocketFailureSource,
    code?: TerminalTransportFailureCode,
    reason?: string,
  ) => void;
};

type TransportOrchestrator = {
  status: TransportState["status"];
  reconnectAttempt: number;
  latencyMs: number | null;
  lastSocketFailure: string;
  sendPayload: (payload: TerminalClientMessage) => boolean;
  markPong: () => void;
  connect: () => void;
  reconnectNow: () => void;
  scheduleFreshConnection: () => void;
  dispose: () => void;
};

export function useTransportOrchestrator({
  createTransport,
  wsUrl,
  handlers,
  hasSessionContext,
  scheduler,
  onSocketFailure,
}: UseTransportOrchestratorArgs): TransportOrchestrator {
  const [state, dispatch] = useReducer(
    reduceTransportState,
    initialTransportState,
  );
  const stateRef = useRef(state);
  const createTransportRef = useRef(createTransport);
  const hasSessionContextRef = useRef(hasSessionContext);
  const onSocketFailureRef = useRef(onSocketFailure);
  const handlersRef = useRef(handlers);
  const wsUrlRef = useRef(wsUrl);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    createTransportRef.current = createTransport;
  }, [createTransport]);

  useEffect(() => {
    hasSessionContextRef.current = hasSessionContext;
  }, [hasSessionContext]);

  useEffect(() => {
    onSocketFailureRef.current = onSocketFailure;
  }, [onSocketFailure]);

  useEffect(() => {
    wsUrlRef.current = wsUrl;
  }, [wsUrl]);

  const dispatchEvent = useCallback((event: TransportEvent) => {
    stateRef.current = reduceTransportState(stateRef.current, event);
    dispatch(event);
  }, []);

  const lifecycleService = useMemo(
    () =>
      new TransportLifecycleService({
        createTransport: (url) => createTransportRef.current(url),
        getWsUrl: () => wsUrlRef.current,
        getHandlers: () => handlersRef.current,
        hasSessionContext: () => hasSessionContextRef.current(),
        scheduler,
        onSocketFailure: (source, code, reason) =>
          onSocketFailureRef.current(source, code, reason),
        getState: () => stateRef.current,
        dispatchEvent,
      }),
    [dispatchEvent, scheduler],
  );

  useEffect(
    () => () => {
      lifecycleService.dispose();
    },
    [lifecycleService],
  );

  const sendPayload = useCallback(
    (payload: TerminalClientMessage) => lifecycleService.sendPayload(payload),
    [lifecycleService],
  );
  const markPong = useCallback(
    () => lifecycleService.markPong(),
    [lifecycleService],
  );
  const connect = useCallback(
    () => lifecycleService.connect(),
    [lifecycleService],
  );
  const reconnectNow = useCallback(
    () => lifecycleService.reconnectNow(),
    [lifecycleService],
  );
  const scheduleFreshConnection = useCallback(
    () => lifecycleService.scheduleFreshConnection(),
    [lifecycleService],
  );
  const dispose = useCallback(
    () => lifecycleService.dispose(),
    [lifecycleService],
  );

  return {
    status: state.status,
    reconnectAttempt: state.reconnectAttempt,
    latencyMs: state.latencyMs,
    lastSocketFailure: state.lastSocketFailure,
    sendPayload,
    markPong,
    connect,
    reconnectNow,
    scheduleFreshConnection,
    dispose,
  };
}
