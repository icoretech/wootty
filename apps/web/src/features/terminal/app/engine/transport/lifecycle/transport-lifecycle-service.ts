import type {
  TerminalTransport,
  TerminalTransportCloseEvent,
  TerminalTransportErrorEvent,
  TerminalTransportMessageEvent,
} from "../../../../contracts/transport/transport";
import { TRANSPORT_READY_STATE } from "../../../../contracts/transport/transport";
import type { Scheduler } from "../../../../platform/scheduler";
import { createPingMessage } from "../../../../protocol/terminal-client-messages";
import type { TerminalClientMessage } from "../../../../protocol/terminal-wire-schema";
import type { TransportFailureSink } from "../contracts/transport-failure-contract";
import { TransportFailureReporter } from "../reliability/transport-failure-reporter";
import { TransportHeartbeatMonitor } from "../reliability/transport-heartbeat-monitor";
import { TERMINAL_CLOSE_CODE } from "../state/transport-policy";
import type {
  TransportEvent,
  TransportState,
} from "../state/transport-state-machine";
import {
  type TransportBootstrapFailureReasonCode,
  TransportConnectionBootstrap,
} from "../transport-connection-bootstrap";
import { TransportCloseCoordinator } from "./transport-close-coordinator";
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

export class TransportLifecycleService {
  private readonly deps: TransportLifecycleServiceDeps;
  private readonly heartbeatMonitor: TransportHeartbeatMonitor;
  private readonly failureReporter: TransportFailureReporter;
  private readonly connectionBootstrap: TransportConnectionBootstrap;
  private readonly closeCoordinator: TransportCloseCoordinator;
  private readonly socketSession: TransportSocketSession;
  private socketErrorGeneration: number | null = null;

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
    this.closeCoordinator = new TransportCloseCoordinator({
      scheduler: this.deps.scheduler,
      dispatchEvent: this.deps.dispatchEvent,
      connect: () => {
        this.connect();
      },
      reportCloseFailure: (closeCode, closeReason) => {
        this.failureReporter.report({
          source: "close",
          code: closeCode,
          reasonCode: "socket_failure",
          technicalDetail: closeReason,
        });
      },
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
        this.socketErrorGeneration = null;
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
      tryClose: () => {
        return this.socketSession.closeActiveWithIntent(
          TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
          "manual reconnect",
          "manual",
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
      tryClose: () => {
        return this.socketSession.closeActiveWithIntent(
          TERMINAL_CLOSE_CODE.START_FRESH_SESSION,
          "start fresh session",
          "fresh",
        );
      },
      fallback: () => {
        this.connect();
      },
    });
  };

  dispose = (): void => {
    this.executeLifecycleCommand({
      tryClose: () => {
        return this.socketSession.closeActiveWithIntent(
          1000,
          "component unmount",
          "dispose",
        );
      },
      fallback: () => {
        this.socketSession.clear();
        this.deps.dispatchEvent({ type: "socket-closed" });
      },
    });
  };

  private executeLifecycleCommand(options: {
    clearReconnectAttempts?: boolean;
    tryClose: () => boolean;
    fallback: () => void;
  }): void {
    if (options.clearReconnectAttempts) {
      this.deps.dispatchEvent({ type: "clear-reconnect-attempts" });
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
    this.socketErrorGeneration = socketGeneration;
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
    const closedSocket = this.socketSession.releaseIfCurrentWithIntent(
      socket,
      socketGeneration,
    );
    if (!closedSocket.released) {
      return;
    }

    this.clearLifecycleTimers();
    const shouldReportCloseFailure =
      this.socketErrorGeneration !== socketGeneration;
    const reconnectAttempt = this.deps.getState().reconnectAttempt;
    this.socketErrorGeneration = null;

    this.closeCoordinator.handleSocketClose({
      closeIntent: closedSocket.closeIntent,
      closeCode: event.code,
      closeReason: event.reason,
      reconnectAttempt,
      shouldReportCloseFailure,
    });
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
    this.closeCoordinator.clearReconnectTimer();
  }

  private getRuntimeContext(): TransportRuntimeContext {
    return this.deps.getRuntimeContext();
  }
}
