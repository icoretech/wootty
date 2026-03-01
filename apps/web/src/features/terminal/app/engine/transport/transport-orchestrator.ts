import { useCallback, useEffect, useRef, useState } from "react";
import type { TransportFailureReasonCode } from "../../../contracts/transport/failure-reason";
import type {
  TerminalTransport,
  TerminalTransportFailureCode,
} from "../../../contracts/transport/transport";
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
    reasonCode?: TransportFailureReasonCode,
    technicalDetail?: string,
    cause?: unknown,
    noticeMessage?: string,
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
  reconnectWithEndpointChange: () => void;
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
  const [state, setState] = useState(initialTransportState);
  const stateRef = useRef(initialTransportState);
  const createTransportRef = useRef(createTransport);
  const wsUrlRef = useRef(wsUrl);
  const handlersRef = useRef(handlers);
  const hasSessionContextRef = useRef(hasSessionContext);
  const onSocketFailureRef = useRef(onSocketFailure);
  const schedulerRef = useRef(scheduler);
  const schedulerProxyRef = useRef<Scheduler | null>(null);
  const lifecycleServiceRef = useRef<TransportLifecycleService | null>(null);

  createTransportRef.current = createTransport;
  wsUrlRef.current = wsUrl;
  handlersRef.current = handlers;
  hasSessionContextRef.current = hasSessionContext;
  onSocketFailureRef.current = onSocketFailure;
  schedulerRef.current = scheduler;

  const dispatchEvent = useCallback((event: TransportEvent) => {
    const nextState = reduceTransportState(stateRef.current, event);
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  if (schedulerProxyRef.current === null) {
    schedulerProxyRef.current = {
      now: () => schedulerRef.current.now(),
      setTimeout: (task, delayMs) => {
        return schedulerRef.current.setTimeout(task, delayMs);
      },
      clearTimeout: (timerId) => {
        schedulerRef.current.clearTimeout(timerId);
      },
      setInterval: (task, delayMs) => {
        return schedulerRef.current.setInterval(task, delayMs);
      },
      clearInterval: (timerId) => {
        schedulerRef.current.clearInterval(timerId);
      },
    };
  }

  if (lifecycleServiceRef.current === null) {
    lifecycleServiceRef.current = new TransportLifecycleService({
      createTransport: (url) => {
        return createTransportRef.current(url);
      },
      getWsUrl: () => wsUrlRef.current,
      getHandlers: () => handlersRef.current,
      hasSessionContext: () => hasSessionContextRef.current(),
      scheduler: schedulerProxyRef.current,
      onSocketFailure: (...args) => {
        onSocketFailureRef.current(...args);
      },
      getState: () => stateRef.current,
      dispatchEvent,
    });
  }
  const lifecycleService = lifecycleServiceRef.current;

  useEffect(
    () => () => {
      lifecycleService.dispose();
      lifecycleServiceRef.current = null;
    },
    [lifecycleService],
  );

  return {
    status: state.status,
    reconnectAttempt: state.reconnectAttempt,
    latencyMs: state.latencyMs,
    lastSocketFailure: state.lastSocketFailure,
    sendPayload: lifecycleService.sendPayload,
    markPong: lifecycleService.markPong,
    connect: lifecycleService.connect,
    reconnectNow: lifecycleService.reconnectNow,
    reconnectWithEndpointChange: lifecycleService.reconnectWithEndpointChange,
    scheduleFreshConnection: lifecycleService.scheduleFreshConnection,
    dispose: lifecycleService.dispose,
  };
}
