import type { TransportFailureReasonCode } from "../../../contracts/transport/failure-reason";
import type {
  TerminalTransport,
  TerminalTransportCloseEvent,
  TerminalTransportErrorEvent,
  TerminalTransportFailureCode,
  TerminalTransportMessageEvent,
} from "../../../contracts/transport/transport";
import { TRANSPORT_READY_STATE } from "../../../contracts/transport/transport";
import type { Scheduler } from "../../../platform/scheduler";
import { createPingMessage } from "../../../protocol/terminal-client-messages";
import type { TerminalClientMessage } from "../../../protocol/terminal-wire-schema";
import {
  type TransportBootstrapFailureReasonCode,
  TransportConnectionBootstrap,
} from "./transport-connection-bootstrap";
import {
  type SocketFailureSource,
  TransportFailureReporter,
} from "./transport-failure-reporter";
import { TransportHeartbeatMonitor } from "./transport-heartbeat-monitor";
import { TERMINAL_CLOSE_CODE } from "./transport-policy";
import { TransportReconnectController } from "./transport-reconnect-controller";
import { resolveTransportClosePlan } from "./transport-recovery-plan";
import { TransportSocketSession } from "./transport-socket-session";
import type {
  SocketCloseIntent,
  TransportEvent,
  TransportState,
} from "./transport-state-machine";

export type TransportHandlers = {
  onOpen: () => void;
  onMessage: (event: TerminalTransportMessageEvent) => void;
};

type TransportFailureSink = (
  source: SocketFailureSource,
  code?: TerminalTransportFailureCode,
  reasonCode?: TransportFailureReasonCode,
  technicalDetail?: string,
  cause?: unknown,
  noticeMessage?: string,
) => void;

type TransportRuntimeContext = {
  wsUrl: string | null;
  handlers: TransportHandlers;
  hasSessionContext: () => boolean;
  onSocketFailure: TransportFailureSink;
};

type TransportLifecycleServiceDeps = {
  createTransport: (url: string) => TerminalTransport;
  scheduler: Scheduler;
  runtimeContext: TransportRuntimeContext;
  getState: () => TransportState;
  dispatchEvent: (event: TransportEvent) => void;
};

export class TransportLifecycleService {
  private readonly deps: TransportLifecycleServiceDeps;
  private readonly heartbeatMonitor: TransportHeartbeatMonitor;
  private readonly failureReporter: TransportFailureReporter;
  private readonly connectionBootstrap: TransportConnectionBootstrap;
  private readonly reconnectController: TransportReconnectController;
  private readonly socketSession: TransportSocketSession;
  private runtimeContext: TransportRuntimeContext;
  private socketErrorSinceConnect = false;

  constructor(deps: TransportLifecycleServiceDeps) {
    this.deps = deps;
    this.runtimeContext = deps.runtimeContext;
    this.heartbeatMonitor = new TransportHeartbeatMonitor({
      scheduler: this.deps.scheduler,
      onPing: () => {
        this.sendPayload(createPingMessage());
      },
      onPongTimeout: () => {
        this.socketSession.closeActive(
          TERMINAL_CLOSE_CODE.PONG_TIMEOUT,
          "pong timeout",
        );
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
      onSocketFailure: this.runtimeContext.onSocketFailure,
    });
    this.connectionBootstrap = new TransportConnectionBootstrap({
      createTransport: this.deps.createTransport,
    });
    this.reconnectController = new TransportReconnectController({
      scheduler: this.deps.scheduler,
    });
    this.socketSession = new TransportSocketSession();
  }

  updateRuntimeContext(next: TransportRuntimeContext): void {
    this.runtimeContext = next;
    this.failureReporter.setOnSocketFailure(next.onSocketFailure);
  }

  sendPayload = (payload: TerminalClientMessage): boolean => {
    const socket = this.socketSession.current();
    if (!socket || socket.readyState !== TRANSPORT_READY_STATE.OPEN) {
      return false;
    }

    try {
      socket.send(JSON.stringify(payload));
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
    if (this.socketSession.hasActiveConnection()) {
      return;
    }

    this.deps.dispatchEvent({
      type: "set-connecting",
      reconnecting: this.runtimeContext.hasSessionContext(),
    });

    const bootstrapResult = this.connectionBootstrap.createSocket(
      this.runtimeContext.wsUrl,
    );
    if (!bootstrapResult.ok) {
      this.failConnectionBootstrap(
        bootstrapResult.reasonCode,
        bootstrapResult.debugDetail,
        bootstrapResult.cause,
      );
      return;
    }

    const ws = bootstrapResult.socket;
    this.socketSession.attach(ws, {
      onOpen: () => {
        if (this.socketSession.current() !== ws) {
          return;
        }
        this.socketErrorSinceConnect = false;
        this.failureReporter.reset();
        this.deps.dispatchEvent({ type: "connected" });
        this.runtimeContext.handlers.onOpen();
        this.heartbeatMonitor.start();
      },
      onMessage: (event) => {
        if (this.socketSession.current() !== ws) {
          return;
        }
        this.runtimeContext.handlers.onMessage(event);
      },
      onClose: (event) => {
        this.onSocketClose(ws, event);
      },
      onError: (event) => {
        this.onSocketError(ws, event);
      },
    });
  };

  reconnectNow = (): void => {
    this.deps.dispatchEvent({ type: "clear-reconnect-attempts" });
    this.setCloseIntent("manual");
    this.clearLifecycleTimers();
    if (
      this.socketSession.closeActive(
        TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
        "manual reconnect",
      )
    ) {
      return;
    }
    this.connect();
  };

  reconnectWithEndpointChange = (): void => {
    this.deps.dispatchEvent({ type: "clear-reconnect-attempts" });
    this.clearLifecycleTimers();

    const previousSocket = this.socketSession.detachForSocketSwap();
    if (
      previousSocket &&
      previousSocket.readyState < TRANSPORT_READY_STATE.CLOSING
    ) {
      // Detach before reconnect so connect() is not blocked by the old socket state.
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

    if (
      this.socketSession.closeActive(
        TERMINAL_CLOSE_CODE.START_FRESH_SESSION,
        "start fresh session",
      )
    ) {
      return;
    }

    this.connect();
  };

  dispose = (): void => {
    this.setCloseIntent("dispose");
    this.clearLifecycleTimers();
    if (this.socketSession.closeActive(1000, "component unmount")) {
      return;
    }
    this.socketSession.clear();
    this.deps.dispatchEvent({ type: "socket-closed" });
  };

  private onSocketError(
    socket: TerminalTransport,
    event: TerminalTransportErrorEvent,
  ): void {
    if (this.socketSession.current() !== socket) {
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
    const isCurrentSocket = this.socketSession.releaseIfCurrent(socket);
    if (!isCurrentSocket && this.socketSession.current() !== null) {
      return;
    }

    this.clearLifecycleTimers();
    const closeIntent = this.deps.getState().closeIntent;
    const shouldReportCloseFailure = !this.socketErrorSinceConnect;
    const reconnectAttempt = this.deps.getState().reconnectAttempt;
    this.socketErrorSinceConnect = false;
    this.setCloseIntent("normal");

    const closePlan = resolveTransportClosePlan({
      closeIntent,
      closeCode: event.code,
      reconnectAttempt,
    });

    if (closePlan.kind === "disposed") {
      this.deps.dispatchEvent({ type: "socket-closed" });
      return;
    }

    if (closePlan.kind === "reconnect-immediate") {
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

    if (closePlan.kind === "nonrecoverable") {
      this.deps.dispatchEvent({ type: "socket-error" });
      return;
    }

    if (closePlan.kind === "reconnect-exhausted") {
      this.deps.dispatchEvent({
        type: "socket-failure",
        context: `close reason=reconnect exhausted attempts=${closePlan.attempt}`,
      });
      this.deps.dispatchEvent({ type: "socket-error" });
      return;
    }

    this.deps.dispatchEvent({
      type: "schedule-reconnect",
      attempt: closePlan.nextAttempt,
    });
    this.reconnectController.scheduleReconnect(closePlan.delayMs, () => {
      this.connect();
    });
  }

  private setCloseIntent(intent: SocketCloseIntent): void {
    this.deps.dispatchEvent({ type: "set-close-intent", intent });
  }

  private failConnectionBootstrap(
    reasonCode: TransportBootstrapFailureReasonCode,
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
    this.reconnectController.clearReconnectTimer();
  }
}

export type { SocketFailureSource };
