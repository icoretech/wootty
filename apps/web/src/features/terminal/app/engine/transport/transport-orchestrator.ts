import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  TerminalTransport,
  TerminalTransportFailureCode,
} from "../../../contracts/transport";
import type { TransportFailureReasonCode } from "../../../contracts/transport-failure-reason";
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
    debugDetail?: string,
    cause?: unknown,
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

  const dispatchEvent = useCallback((event: TransportEvent) => {
    const nextState = reduceTransportState(stateRef.current, event);
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const lifecycleService = useMemo(
    () =>
      new TransportLifecycleService({
        createTransport,
        getWsUrl: () => wsUrl,
        getHandlers: () => handlers,
        hasSessionContext,
        scheduler,
        onSocketFailure,
        getState: () => stateRef.current,
        dispatchEvent,
      }),
    [
      createTransport,
      dispatchEvent,
      handlers,
      hasSessionContext,
      onSocketFailure,
      scheduler,
      wsUrl,
    ],
  );

  useEffect(
    () => () => {
      lifecycleService.dispose();
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
