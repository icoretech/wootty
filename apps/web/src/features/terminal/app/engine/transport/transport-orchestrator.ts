import { useCallback, useEffect, useRef, useState } from "react";
import type { TerminalTransport } from "../../../contracts/transport/transport";
import type { Scheduler } from "../../../platform/scheduler";
import type { TerminalClientMessage } from "../../../protocol/terminal-wire-schema";
import type { TransportFailureSink } from "./transport-failure-contract";
import {
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
  onSocketFailure: TransportFailureSink;
};

export type TransportOrchestrator = {
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
  const lifecycleServiceRef = useRef<TransportLifecycleService | null>(null);

  const dispatchEvent = useCallback((event: TransportEvent) => {
    const nextState = reduceTransportState(stateRef.current, event);
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  if (lifecycleServiceRef.current === null) {
    lifecycleServiceRef.current = new TransportLifecycleService({
      createTransport,
      scheduler,
      runtimeContext: {
        wsUrl,
        handlers,
        hasSessionContext,
        onSocketFailure,
      },
      getState: () => stateRef.current,
      dispatchEvent,
    });
  }
  const lifecycleService = lifecycleServiceRef.current;

  useEffect(() => {
    lifecycleService.updateRuntimeContext({
      wsUrl,
      handlers,
      hasSessionContext,
      onSocketFailure,
    });
  }, [handlers, hasSessionContext, lifecycleService, onSocketFailure, wsUrl]);

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
