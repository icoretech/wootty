import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from "react";
import type {
  TerminalTransport,
  TerminalTransportCloseEvent,
  TerminalTransportErrorEvent,
  TerminalTransportFailureCode,
  TerminalTransportMessageEvent,
} from "../../../contracts/transport";
import { TRANSPORT_READY_STATE } from "../../../contracts/transport";
import {
  type FailureNoticeState,
  notifyWithFailureThrottle,
} from "../../../notifications/failure-notice-throttle";
import type {
  Scheduler,
  SchedulerTimerHandle,
} from "../../../platform/scheduler";
import { createPingMessage } from "../../../protocol/terminal-client-messages";
import type { TerminalClientMessage } from "../../../protocol/terminal-wire-schema";
import {
  isRecoverableTransportClose,
  reconnectDelayMs,
  TERMINAL_CLOSE_CODE,
  TERMINAL_HEARTBEAT_MS,
  TERMINAL_RECONNECT_POLICY,
} from "./transport-policy";
import {
  initialTransportState,
  reduceTransportState,
  type SocketCloseIntent,
  type TransportState,
} from "./transport-state-machine";

type SocketFailureSource = "error" | "close";

type TransportHandlers = {
  onOpen: () => void;
  onMessage: (event: TerminalTransportMessageEvent) => void;
};

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

const SOCKET_FAILURE_NOTICE_COOLDOWN_MS = 15_000;

type TimerRef = MutableRefObject<SchedulerTimerHandle | null>;

function clearTimer(ref: TimerRef, scheduler: Scheduler): void {
  if (ref.current === null) {
    return;
  }
  scheduler.clearTimeout(ref.current);
  ref.current = null;
}

function clearIntervalTimer(ref: TimerRef, scheduler: Scheduler): void {
  if (ref.current === null) {
    return;
  }
  scheduler.clearInterval(ref.current);
  ref.current = null;
}

function socketFailureContext(
  source: SocketFailureSource,
  code?: TerminalTransportFailureCode,
  reason?: string,
): string {
  const contextParts: string[] = [source];
  if (typeof code === "number" || typeof code === "string") {
    contextParts.push(`code=${code}`);
  }
  if (typeof reason === "string" && reason.length > 0) {
    contextParts.push(`reason=${reason}`);
  }
  return contextParts.join(" ");
}

function invalidEndpointReason(endpoint: string | null): string | null {
  if (typeof endpoint !== "string" || endpoint.trim().length === 0) {
    return "websocket endpoint unavailable";
  }
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol === "ws:" || parsed.protocol === "wss:") {
      return null;
    }
    return `invalid websocket endpoint protocol '${parsed.protocol}'`;
  } catch {
    return `invalid websocket endpoint '${endpoint}'`;
  }
}

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
  const handlersRef = useRef(handlers);
  const wsRef = useRef<TerminalTransport | null>(null);
  const reconnectTimerRef = useRef<SchedulerTimerHandle | null>(null);
  const pingTimerRef = useRef<SchedulerTimerHandle | null>(null);
  const pongTimeoutRef = useRef<SchedulerTimerHandle | null>(null);
  const pingSentAtRef = useRef<number | null>(null);
  const closedByUserRef = useRef(false);
  const pendingFreshConnectRef = useRef(false);
  const socketFailureNoticeRef = useRef<FailureNoticeState>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const clearLifecycleTimers = useCallback(() => {
    clearIntervalTimer(pingTimerRef, scheduler);
    clearTimer(pongTimeoutRef, scheduler);
    clearTimer(reconnectTimerRef, scheduler);
  }, [scheduler]);

  const setCloseIntent = useCallback((intent: SocketCloseIntent) => {
    stateRef.current = {
      ...stateRef.current,
      closeIntent: intent,
    };
    dispatch({ type: "set-close-intent", intent });
  }, []);

  const reportSocketFailure = useCallback(
    (
      source: SocketFailureSource,
      code?: TerminalTransportFailureCode,
      reason?: string,
    ) => {
      const context = socketFailureContext(source, code, reason);
      dispatch({ type: "socket-failure", context });

      const noticeKey = `${source}|${String(code ?? "")}|${reason ?? ""}`;
      const baseReason =
        reason && reason.length > 0 ? reason : "transport failure";
      const nextNoticeState = notifyWithFailureThrottle({
        current: socketFailureNoticeRef.current,
        key: noticeKey,
        nowMs: scheduler.now(),
        cooldownMs: SOCKET_FAILURE_NOTICE_COOLDOWN_MS,
        baseMessage: baseReason,
        notify: (message) => {
          onSocketFailure(source, code, message);
        },
      });
      socketFailureNoticeRef.current = nextNoticeState.next;
    },
    [onSocketFailure, scheduler],
  );

  const sendPayload = useCallback(
    (payload: TerminalClientMessage): boolean => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== TRANSPORT_READY_STATE.OPEN) {
        return false;
      }

      try {
        ws.send(JSON.stringify(payload));
        return true;
      } catch (error) {
        const reason =
          error instanceof Error && error.message.length > 0
            ? error.message
            : "transport send failed";
        reportSocketFailure("error", undefined, reason);
        dispatch({ type: "socket-error" });
        return false;
      }
    },
    [reportSocketFailure],
  );

  const markPong = useCallback(() => {
    if (pingSentAtRef.current !== null) {
      dispatch({
        type: "latency",
        latencyMs: scheduler.now() - pingSentAtRef.current,
      });
    }
    clearTimer(pongTimeoutRef, scheduler);
  }, [scheduler]);

  const connect = useCallback(() => {
    if (
      wsRef.current &&
      wsRef.current.readyState <= TRANSPORT_READY_STATE.OPEN
    ) {
      return;
    }

    dispatch({
      type: "set-connecting",
      reconnecting: hasSessionContext(),
    });

    const endpointError = invalidEndpointReason(wsUrl);
    if (endpointError) {
      reportSocketFailure("error", undefined, endpointError);
      dispatch({ type: "socket-error" });
      return;
    }
    const socketUrl = wsUrl;
    if (typeof socketUrl !== "string") {
      reportSocketFailure("error", undefined, "websocket endpoint unavailable");
      dispatch({ type: "socket-error" });
      return;
    }

    let ws: TerminalTransport;
    try {
      ws = createTransport(socketUrl);
    } catch (error) {
      const reason =
        error instanceof Error && error.message.length > 0
          ? error.message
          : "transport bootstrap failed";
      reportSocketFailure("error", undefined, reason);
      dispatch({ type: "socket-error" });
      return;
    }
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      if (wsRef.current !== ws) {
        return;
      }
      socketFailureNoticeRef.current = null;
      dispatch({ type: "connected" });
      handlersRef.current.onOpen();

      clearIntervalTimer(pingTimerRef, scheduler);
      pingTimerRef.current = scheduler.setInterval(() => {
        pingSentAtRef.current = scheduler.now();
        sendPayload(createPingMessage());

        clearTimer(pongTimeoutRef, scheduler);
        pongTimeoutRef.current = scheduler.setTimeout(() => {
          const activeSocket = wsRef.current;
          if (
            activeSocket &&
            activeSocket.readyState < TRANSPORT_READY_STATE.CLOSING
          ) {
            activeSocket.close(
              TERMINAL_CLOSE_CODE.PONG_TIMEOUT,
              "pong timeout",
            );
          }
        }, TERMINAL_HEARTBEAT_MS.PONG_TIMEOUT);
      }, TERMINAL_HEARTBEAT_MS.INTERVAL);
    });

    ws.addEventListener("message", (event) => {
      if (wsRef.current !== ws) {
        return;
      }
      handlersRef.current.onMessage(event);
    });

    ws.addEventListener("close", (event: TerminalTransportCloseEvent) => {
      const isCurrentSocket = wsRef.current === ws;
      if (isCurrentSocket) {
        wsRef.current = null;
      }
      if (!isCurrentSocket && wsRef.current !== null) {
        return;
      }

      clearLifecycleTimers();
      if (closedByUserRef.current) {
        setCloseIntent("normal");
        dispatch({ type: "socket-closed" });
        return;
      }

      const closeIntent = stateRef.current.closeIntent;
      setCloseIntent("normal");

      if (closeIntent === "fresh") {
        dispatch({ type: "set-connecting", reconnecting: false });
        if (pendingFreshConnectRef.current) {
          pendingFreshConnectRef.current = false;
          connect();
        }
        return;
      }

      if (closeIntent === "manual") {
        dispatch({ type: "set-connecting", reconnecting: false });
        connect();
        return;
      }

      reportSocketFailure("close", event.code, event.reason);
      if (!isRecoverableTransportClose(event.code)) {
        dispatch({ type: "socket-error" });
        return;
      }

      const attempt = stateRef.current.reconnectAttempt;
      if (attempt >= TERMINAL_RECONNECT_POLICY.MAX_ATTEMPTS) {
        dispatch({
          type: "socket-failure",
          context: `close reason=reconnect exhausted attempts=${attempt}`,
        });
        dispatch({ type: "socket-error" });
        return;
      }

      const nextAttempt = attempt + 1;
      dispatch({ type: "schedule-reconnect", attempt: nextAttempt });
      reconnectTimerRef.current = scheduler.setTimeout(() => {
        connect();
      }, reconnectDelayMs(attempt));
    });

    ws.addEventListener("error", (event: TerminalTransportErrorEvent) => {
      if (wsRef.current !== ws) {
        return;
      }
      reportSocketFailure("error", event.code, event.message);
      dispatch({ type: "socket-error" });
    });
  }, [
    clearLifecycleTimers,
    createTransport,
    hasSessionContext,
    reportSocketFailure,
    scheduler,
    sendPayload,
    setCloseIntent,
    wsUrl,
  ]);

  const reconnectNow = useCallback(() => {
    closedByUserRef.current = false;
    dispatch({ type: "clear-reconnect-attempts" });
    setCloseIntent("manual");
    clearLifecycleTimers();
    const ws = wsRef.current;
    if (ws && ws.readyState < TRANSPORT_READY_STATE.CLOSING) {
      ws.close(TERMINAL_CLOSE_CODE.MANUAL_RECONNECT, "manual reconnect");
      return;
    }
    connect();
  }, [clearLifecycleTimers, connect, setCloseIntent]);

  const scheduleFreshConnection = useCallback(() => {
    dispatch({ type: "clear-reconnect-attempts" });
    setCloseIntent("fresh");
    clearLifecycleTimers();
    pendingFreshConnectRef.current = true;

    const ws = wsRef.current;
    if (ws && ws.readyState < TRANSPORT_READY_STATE.CLOSING) {
      ws.close(TERMINAL_CLOSE_CODE.START_FRESH_SESSION, "start fresh session");
      return;
    }

    pendingFreshConnectRef.current = false;
    connect();
  }, [clearLifecycleTimers, connect, setCloseIntent]);

  const dispose = useCallback(() => {
    closedByUserRef.current = true;
    pendingFreshConnectRef.current = false;
    setCloseIntent("normal");
    clearLifecycleTimers();
    const ws = wsRef.current;
    if (ws && ws.readyState < TRANSPORT_READY_STATE.CLOSING) {
      ws.close(1000, "component unmount");
    }
  }, [clearLifecycleTimers, setCloseIntent]);

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
