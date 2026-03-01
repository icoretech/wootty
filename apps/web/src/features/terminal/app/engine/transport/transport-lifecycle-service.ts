import type {
  TerminalTransport,
  TerminalTransportCloseEvent,
  TerminalTransportErrorEvent,
  TerminalTransportMessageEvent,
} from "../../../contracts/transport/transport";
import { TRANSPORT_READY_STATE } from "../../../contracts/transport/transport";
import type { Scheduler } from "../../../platform/scheduler";
import { createPingMessage } from "../../../protocol/terminal-client-messages";
import type { TerminalClientMessage } from "../../../protocol/terminal-wire-schema";
import { TransportCommandExecutor } from "./transport-command-executor";
import {
  type TransportBootstrapFailureReasonCode,
  TransportConnectionBootstrap,
} from "./transport-connection-bootstrap";
import type { TransportFailureSink } from "./transport-failure-contract";
import { TransportFailureReporter } from "./transport-failure-reporter";
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
  private readonly commandExecutor: TransportCommandExecutor;
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
    this.commandExecutor = new TransportCommandExecutor({
      dispatchEvent: this.deps.dispatchEvent,
      setCloseIntent: (intent) => {
        this.setCloseIntent(intent);
      },
      clearLifecycleTimers: () => {
        this.clearLifecycleTimers();
      },
      closeActiveSocket: (code, reason) => {
        return this.socketSession.closeActive(code, reason);
      },
      detachSocketForSwap: () => {
        return this.socketSession.detachForSocketSwap();
      },
      clearSocket: () => {
        this.socketSession.clear();
      },
      connect: () => {
        this.connect();
      },
    });
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
      this.failureReporter.report({
        source: "error",
        reasonCode: "send_failed",
        technicalDetail: reason,
        cause: error,
      });
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
    const socketGeneration = this.socketSession.attach(ws, {
      onOpen: () => {
        if (!this.socketSession.isCurrent(ws, socketGeneration)) {
          return;
        }
        this.socketErrorSinceConnect = false;
        this.failureReporter.reset();
        this.deps.dispatchEvent({ type: "connected" });
        this.runtimeContext.handlers.onOpen();
        this.heartbeatMonitor.start();
      },
      onMessage: (event) => {
        if (!this.socketSession.isCurrent(ws, socketGeneration)) {
          return;
        }
        this.runtimeContext.handlers.onMessage(event);
      },
      onClose: (event) => {
        this.onSocketClose(ws, socketGeneration, event);
      },
      onError: (event) => {
        this.onSocketError(ws, socketGeneration, event);
      },
    });
  };

  reconnectNow = (): void => {
    this.commandExecutor.reconnectNow();
  };

  reconnectWithEndpointChange = (): void => {
    this.commandExecutor.reconnectWithEndpointChange();
  };

  scheduleFreshConnection = (): void => {
    this.commandExecutor.scheduleFreshConnection();
  };

  dispose = (): void => {
    this.commandExecutor.dispose();
  };

  private onSocketError(
    socket: TerminalTransport,
    socketGeneration: number,
    event: TerminalTransportErrorEvent,
  ): void {
    if (!this.socketSession.isCurrent(socket, socketGeneration)) {
      return;
    }
    this.socketErrorSinceConnect = true;
    this.failureReporter.report({
      source: "error",
      code: event.code,
      reasonCode: "socket_failure",
      technicalDetail: event.message,
      cause: event.cause,
    });
    this.deps.dispatchEvent({ type: "socket-error" });
  }

  private onSocketClose(
    socket: TerminalTransport,
    socketGeneration: number,
    event: TerminalTransportCloseEvent,
  ): void {
    const isCurrentSocket = this.socketSession.releaseIfCurrent(
      socket,
      socketGeneration,
    );
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
      this.failureReporter.report({
        source: "close",
        code: event.code,
        reasonCode: "socket_failure",
        technicalDetail: event.reason,
      });
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
    this.failureReporter.report({
      source: "error",
      reasonCode,
      technicalDetail: debugDetail,
      cause,
    });
    this.deps.dispatchEvent({ type: "socket-error" });
  }

  private clearLifecycleTimers(): void {
    this.heartbeatMonitor.stop();
    this.reconnectController.clearReconnectTimer();
  }
}
