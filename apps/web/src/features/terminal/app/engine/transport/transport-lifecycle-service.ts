import { redactTokenInUrlForNotice } from "../../../bootstrap/url/redact-token-in-url";
import type {
  TerminalTransport,
  TerminalTransportCloseEvent,
  TerminalTransportErrorEvent,
  TerminalTransportFailureCode,
  TerminalTransportMessageEvent,
} from "../../../contracts/transport";
import { TRANSPORT_READY_STATE } from "../../../contracts/transport";
import type { TransportFailureReasonCode } from "../../../contracts/transport-failure-reason";
import type {
  Scheduler,
  SchedulerTimerHandle,
} from "../../../platform/scheduler";
import { createPingMessage } from "../../../protocol/terminal-client-messages";
import type { TerminalClientMessage } from "../../../protocol/terminal-wire-schema";
import { validateWebsocketEndpoint } from "../../../validation/websocket-endpoint";
import {
  type SocketFailureSource,
  TransportFailureReporter,
} from "./transport-failure-reporter";
import { TransportHeartbeatMonitor } from "./transport-heartbeat-monitor";
import {
  isRecoverableTransportClose,
  reconnectDelayMs,
  TERMINAL_CLOSE_CODE,
  TERMINAL_RECONNECT_POLICY,
} from "./transport-policy";
import type {
  SocketCloseIntent,
  TransportEvent,
  TransportState,
} from "./transport-state-machine";

type TransportHandlers = {
  onOpen: () => void;
  onMessage: (event: TerminalTransportMessageEvent) => void;
};

type TransportLifecycleServiceDeps = {
  createTransport: (url: string) => TerminalTransport;
  getWsUrl: () => string | null;
  getHandlers: () => TransportHandlers;
  hasSessionContext: () => boolean;
  scheduler: Scheduler;
  onSocketFailure: (
    source: SocketFailureSource,
    code?: TerminalTransportFailureCode,
    reasonCode?: TransportFailureReasonCode,
    debugDetail?: string,
    cause?: unknown,
  ) => void;
  getState: () => TransportState;
  dispatchEvent: (event: TransportEvent) => void;
};

type TimerHandle = SchedulerTimerHandle | null;
type WsEndpointResolution =
  | { ok: true; wsUrl: string }
  | {
      ok: false;
      reasonCode:
        | "endpoint_unavailable"
        | "endpoint_invalid_format"
        | "endpoint_unsupported_protocol";
      debugDetail: string;
    };

function resolveWsEndpoint(endpoint: string | null): WsEndpointResolution {
  const validation = validateWebsocketEndpoint(endpoint);
  if (validation.ok) {
    return {
      ok: true,
      wsUrl: validation.endpoint,
    };
  }
  if (validation.reason === "unavailable") {
    return {
      ok: false,
      reasonCode: "endpoint_unavailable",
      debugDetail: "websocket endpoint unavailable",
    };
  }
  if (validation.reason === "unsupported_protocol") {
    return {
      ok: false,
      reasonCode: "endpoint_unsupported_protocol",
      debugDetail: `invalid websocket endpoint protocol '${validation.protocol}'`,
    };
  }
  return {
    ok: false,
    reasonCode: "endpoint_invalid_format",
    debugDetail:
      typeof endpoint === "string" && endpoint.length > 0
        ? `invalid websocket endpoint '${redactTokenInUrlForNotice(endpoint)}'`
        : "invalid websocket endpoint format",
  };
}

export class TransportLifecycleService {
  private readonly deps: TransportLifecycleServiceDeps;
  private readonly heartbeatMonitor: TransportHeartbeatMonitor;
  private readonly failureReporter: TransportFailureReporter;
  private ws: TerminalTransport | null = null;
  private reconnectTimer: TimerHandle = null;
  private closedByUser = false;
  private pendingFreshConnect = false;
  private socketErrorSinceConnect = false;

  constructor(deps: TransportLifecycleServiceDeps) {
    this.deps = deps;
    this.heartbeatMonitor = new TransportHeartbeatMonitor({
      scheduler: this.deps.scheduler,
      onPing: () => {
        this.sendPayload(createPingMessage());
      },
      onPongTimeout: () => {
        if (this.ws && this.ws.readyState < TRANSPORT_READY_STATE.CLOSING) {
          this.ws.close(TERMINAL_CLOSE_CODE.PONG_TIMEOUT, "pong timeout");
        }
      },
      onLatency: (latencyMs) => {
        this.deps.dispatchEvent({
          type: "latency",
          latencyMs,
        });
      },
    });
    this.failureReporter = new TransportFailureReporter({
      scheduler: this.deps.scheduler,
      dispatchSocketFailure: (context) => {
        this.deps.dispatchEvent({ type: "socket-failure", context });
      },
      onSocketFailure: this.deps.onSocketFailure,
    });
  }

  sendPayload = (payload: TerminalClientMessage): boolean => {
    if (!this.ws || this.ws.readyState !== TRANSPORT_READY_STATE.OPEN) {
      return false;
    }

    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      const reason =
        error instanceof Error && error.message.length > 0
          ? error.message
          : "transport send failed";
      this.failureReporter.report(
        "error",
        undefined,
        "send_failed",
        reason,
        error,
      );
      this.deps.dispatchEvent({ type: "socket-error" });
      return false;
    }
  };

  markPong = (): void => {
    this.heartbeatMonitor.markPong();
  };

  connect = (): void => {
    if (this.ws && this.ws.readyState <= TRANSPORT_READY_STATE.OPEN) {
      return;
    }

    this.deps.dispatchEvent({
      type: "set-connecting",
      reconnecting: this.deps.hasSessionContext(),
    });

    const endpointResolution = resolveWsEndpoint(this.deps.getWsUrl());
    if (!endpointResolution.ok) {
      this.failConnectionBootstrap(
        endpointResolution.reasonCode,
        endpointResolution.debugDetail,
      );
      return;
    }

    let ws: TerminalTransport;
    try {
      ws = this.deps.createTransport(endpointResolution.wsUrl);
    } catch (error) {
      const reason =
        error instanceof Error && error.message.length > 0
          ? error.message
          : "transport bootstrap failed";
      this.failConnectionBootstrap("bootstrap_failed", reason, error);
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      if (this.ws !== ws) {
        return;
      }
      this.socketErrorSinceConnect = false;
      this.failureReporter.reset();
      this.deps.dispatchEvent({ type: "connected" });
      this.deps.getHandlers().onOpen();
      this.heartbeatMonitor.start();
    });

    ws.addEventListener("message", (event) => {
      if (this.ws !== ws) {
        return;
      }
      this.deps.getHandlers().onMessage(event);
    });

    ws.addEventListener("close", (event) => {
      this.onSocketClose(ws, event);
    });

    ws.addEventListener("error", (event) => {
      this.onSocketError(ws, event);
    });
  };

  reconnectNow = (): void => {
    this.closedByUser = false;
    this.deps.dispatchEvent({ type: "clear-reconnect-attempts" });
    this.setCloseIntent("manual");
    this.clearLifecycleTimers();
    if (this.ws && this.ws.readyState < TRANSPORT_READY_STATE.CLOSING) {
      this.ws.close(TERMINAL_CLOSE_CODE.MANUAL_RECONNECT, "manual reconnect");
      return;
    }
    this.connect();
  };

  reconnectWithEndpointChange = (): void => {
    this.closedByUser = false;
    this.deps.dispatchEvent({ type: "clear-reconnect-attempts" });
    this.clearLifecycleTimers();

    const previousSocket = this.ws;
    if (
      previousSocket &&
      previousSocket.readyState < TRANSPORT_READY_STATE.CLOSING
    ) {
      // Detach before reconnect so connect() is not blocked by the old socket state.
      this.ws = null;
      this.connect();
      previousSocket.close(
        TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
        "endpoint changed",
      );
      return;
    }

    this.connect();
  };

  scheduleFreshConnection = (): void => {
    this.deps.dispatchEvent({ type: "clear-reconnect-attempts" });
    this.setCloseIntent("fresh");
    this.clearLifecycleTimers();
    this.pendingFreshConnect = true;

    if (this.ws && this.ws.readyState < TRANSPORT_READY_STATE.CLOSING) {
      this.ws.close(
        TERMINAL_CLOSE_CODE.START_FRESH_SESSION,
        "start fresh session",
      );
      return;
    }

    this.pendingFreshConnect = false;
    this.connect();
  };

  dispose = (): void => {
    this.closedByUser = true;
    this.pendingFreshConnect = false;
    this.setCloseIntent("normal");
    this.clearLifecycleTimers();
    if (this.ws && this.ws.readyState < TRANSPORT_READY_STATE.CLOSING) {
      this.ws.close(1000, "component unmount");
    }
  };

  private onSocketError(
    socket: TerminalTransport,
    event: TerminalTransportErrorEvent,
  ): void {
    if (this.ws !== socket) {
      return;
    }
    this.socketErrorSinceConnect = true;
    this.failureReporter.report(
      "error",
      event.code,
      "socket_failure",
      event.message,
    );
    this.deps.dispatchEvent({ type: "socket-error" });
  }

  private onSocketClose(
    socket: TerminalTransport,
    event: TerminalTransportCloseEvent,
  ): void {
    const isCurrentSocket = this.ws === socket;
    if (isCurrentSocket) {
      this.ws = null;
    }
    if (!isCurrentSocket && this.ws !== null) {
      return;
    }

    this.clearLifecycleTimers();
    const shouldReportCloseFailure = !this.socketErrorSinceConnect;
    this.socketErrorSinceConnect = false;
    if (this.closedByUser) {
      this.setCloseIntent("normal");
      this.deps.dispatchEvent({ type: "socket-closed" });
      return;
    }

    const closeIntent = this.deps.getState().closeIntent;
    this.setCloseIntent("normal");

    if (closeIntent === "fresh") {
      this.deps.dispatchEvent({ type: "set-connecting", reconnecting: false });
      if (this.pendingFreshConnect) {
        this.pendingFreshConnect = false;
        this.connect();
      }
      return;
    }

    if (closeIntent === "manual") {
      this.deps.dispatchEvent({ type: "set-connecting", reconnecting: false });
      this.connect();
      return;
    }

    if (shouldReportCloseFailure) {
      this.failureReporter.report(
        "close",
        event.code,
        "socket_failure",
        event.reason,
      );
    }
    if (!isRecoverableTransportClose(event.code)) {
      this.deps.dispatchEvent({ type: "socket-error" });
      return;
    }

    const attempt = this.deps.getState().reconnectAttempt;
    if (attempt >= TERMINAL_RECONNECT_POLICY.MAX_ATTEMPTS) {
      this.deps.dispatchEvent({
        type: "socket-failure",
        context: `close reason=reconnect exhausted attempts=${attempt}`,
      });
      this.deps.dispatchEvent({ type: "socket-error" });
      return;
    }

    const nextAttempt = attempt + 1;
    this.deps.dispatchEvent({
      type: "schedule-reconnect",
      attempt: nextAttempt,
    });
    this.reconnectTimer = this.deps.scheduler.setTimeout(() => {
      this.connect();
    }, reconnectDelayMs(attempt));
  }

  private setCloseIntent(intent: SocketCloseIntent): void {
    this.deps.dispatchEvent({ type: "set-close-intent", intent });
  }

  private failConnectionBootstrap(
    reasonCode:
      | "endpoint_unavailable"
      | "endpoint_invalid_format"
      | "endpoint_unsupported_protocol"
      | "bootstrap_failed",
    debugDetail: string,
    cause?: unknown,
  ): void {
    this.failureReporter.report(
      "error",
      undefined,
      reasonCode,
      debugDetail,
      cause,
    );
    this.deps.dispatchEvent({ type: "socket-error" });
  }

  private clearLifecycleTimers(): void {
    this.heartbeatMonitor.stop();
    this.clearTimer("reconnectTimer");
  }

  private clearTimer(field: "reconnectTimer"): void {
    if (this[field] === null) {
      return;
    }
    this.deps.scheduler.clearTimeout(this[field]);
    this[field] = null;
  }
}

export type { SocketFailureSource, TransportHandlers };
