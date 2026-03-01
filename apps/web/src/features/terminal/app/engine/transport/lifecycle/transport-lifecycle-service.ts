import type {
  TerminalTransport,
  TerminalTransportCloseEvent,
  TerminalTransportErrorEvent,
  TerminalTransportMessageEvent,
} from "../../../../contracts/transport/transport";
import { TRANSPORT_READY_STATE } from "../../../../contracts/transport/transport";
import type {
  Scheduler,
  SchedulerTimerHandle,
} from "../../../../platform/scheduler";
import { createPingMessage } from "../../../../protocol/terminal-client-messages";
import type { TerminalClientMessage } from "../../../../protocol/terminal-wire-schema";
import type { TransportFailureSink } from "../contracts/transport-failure-contract";
import { TransportFailureReporter } from "../reliability/transport-failure-reporter";
import { TransportHeartbeatMonitor } from "../reliability/transport-heartbeat-monitor";
import { TERMINAL_CLOSE_CODE } from "../state/transport-policy";
import type {
  SocketCloseIntent,
  TransportEvent,
  TransportState,
} from "../state/transport-state-machine";
import {
  type TransportBootstrapFailureReasonCode,
  TransportConnectionBootstrap,
} from "../transport-connection-bootstrap";
import { executeTransportClosePlan } from "./transport-close-plan-executor";
import { TransportSocketSession } from "./transport-socket-session";

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
  getRuntimeContext: () => TransportRuntimeContext;
  getState: () => TransportState;
  dispatchEvent: (event: TransportEvent) => void;
};

type TimerHandle = SchedulerTimerHandle | null;

export class TransportLifecycleService {
  private readonly deps: TransportLifecycleServiceDeps;
  private readonly heartbeatMonitor: TransportHeartbeatMonitor;
  private readonly failureReporter: TransportFailureReporter;
  private readonly connectionBootstrap: TransportConnectionBootstrap;
  private readonly socketSession: TransportSocketSession;
  private socketErrorSinceConnect = false;
  private reconnectTimer: TimerHandle = null;

  constructor(deps: TransportLifecycleServiceDeps) {
    this.deps = deps;
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
      onSocketFailure: (failure) => {
        this.getRuntimeContext().onSocketFailure(failure);
      },
    });
    this.connectionBootstrap = new TransportConnectionBootstrap({
      createTransport: this.deps.createTransport,
    });
    this.socketSession = new TransportSocketSession();
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
    const runtimeContext = this.getRuntimeContext();

    this.deps.dispatchEvent({
      type: "set-connecting",
      reconnecting: runtimeContext.hasSessionContext(),
    });

    const bootstrapResult = this.connectionBootstrap.createSocket(
      runtimeContext.wsUrl,
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
        this.getRuntimeContext().handlers.onOpen();
        this.heartbeatMonitor.start();
      },
      onMessage: (event) => {
        if (!this.socketSession.isCurrent(ws, socketGeneration)) {
          return;
        }
        this.getRuntimeContext().handlers.onMessage(event);
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
    this.executeLifecycleCommand({
      clearReconnectAttempts: true,
      closeIntent: "manual",
      tryClose: () => {
        return this.socketSession.closeActive(
          TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
          "manual reconnect",
        );
      },
      fallback: () => {
        this.connect();
      },
    });
  };

  reconnectWithEndpointChange = (): void => {
    this.executeLifecycleCommand({
      clearReconnectAttempts: true,
      tryClose: () => {
        const previousSocket = this.socketSession.detachForSocketSwap();
        if (
          previousSocket &&
          previousSocket.readyState < TRANSPORT_READY_STATE.CLOSING
        ) {
          // Detach before reconnect so connect() is not blocked by old socket state.
          this.connect();
          previousSocket.close(
            TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
            "endpoint changed",
          );
          return true;
        }
        return false;
      },
      fallback: () => {
        this.connect();
      },
    });
  };

  scheduleFreshConnection = (): void => {
    this.executeLifecycleCommand({
      clearReconnectAttempts: true,
      closeIntent: "fresh",
      tryClose: () => {
        return this.socketSession.closeActive(
          TERMINAL_CLOSE_CODE.START_FRESH_SESSION,
          "start fresh session",
        );
      },
      fallback: () => {
        this.connect();
      },
    });
  };

  dispose = (): void => {
    this.executeLifecycleCommand({
      closeIntent: "dispose",
      tryClose: () => {
        return this.socketSession.closeActive(1000, "component unmount");
      },
      fallback: () => {
        this.socketSession.clear();
        this.deps.dispatchEvent({ type: "socket-closed" });
      },
    });
  };

  private executeLifecycleCommand(options: {
    clearReconnectAttempts?: boolean;
    closeIntent?: SocketCloseIntent;
    tryClose: () => boolean;
    fallback: () => void;
  }): void {
    if (options.clearReconnectAttempts) {
      this.deps.dispatchEvent({ type: "clear-reconnect-attempts" });
    }
    if (options.closeIntent) {
      this.setCloseIntent(options.closeIntent);
    }
    this.clearLifecycleTimers();
    if (options.tryClose()) {
      return;
    }
    options.fallback();
  }

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

    executeTransportClosePlan(
      {
        closeIntent,
        closeCode: event.code,
        reconnectAttempt,
        shouldReportCloseFailure,
      },
      {
        dispatchEvent: this.deps.dispatchEvent,
        connect: () => {
          this.connect();
        },
        scheduleReconnect: (delayMs, task) => {
          this.scheduleReconnect(delayMs, task);
        },
        reportCloseFailure: () => {
          this.failureReporter.report({
            source: "close",
            code: event.code,
            reasonCode: "socket_failure",
            technicalDetail: event.reason,
          });
        },
      },
    );
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
    this.clearReconnectTimer();
  }

  private getRuntimeContext(): TransportRuntimeContext {
    return this.deps.getRuntimeContext();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) {
      return;
    }
    this.deps.scheduler.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private scheduleReconnect(delayMs: number, task: () => void): void {
    this.clearReconnectTimer();
    this.reconnectTimer = this.deps.scheduler.setTimeout(() => {
      this.reconnectTimer = null;
      task();
    }, delayMs);
  }
}
