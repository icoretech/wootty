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
import { TransportSocketReliabilityCoordinator } from "../reliability/transport-socket-reliability-coordinator";
import { TERMINAL_CLOSE_CODE } from "../state/transport-policy";
import type {
  TransportEvent,
  TransportState,
} from "../state/transport-state-machine";
import { TransportConnectionBootstrap } from "../transport-connection-bootstrap";
import { executeTransportClosePlan } from "./transport-close-plan-executor";
import { TransportSocketSession } from "./transport-socket-session";

export type TransportHandlers = {
  onOpen: () => void;
  onMessage: (event: TerminalTransportMessageEvent) => void;
};

export type TransportLifecycleRuntimeRef = {
  wsUrl: string | null;
  handlers: TransportHandlers;
  hasSessionContext: boolean;
  onSocketFailure: TransportFailureSink;
};

type TransportLifecycleServiceDeps = {
  createTransport: (url: string) => TerminalTransport;
  scheduler: Scheduler;
  runtime: TransportLifecycleRuntimeRef;
  getState: () => TransportState;
  dispatchEvent: (event: TransportEvent) => void;
};

type TimerHandle = ReturnType<Scheduler["setTimeout"]> | null;

export class TransportLifecycleService {
  private readonly deps: TransportLifecycleServiceDeps;
  private readonly connectionBootstrap: TransportConnectionBootstrap;
  private readonly reliability: TransportSocketReliabilityCoordinator;
  private readonly socketSession: TransportSocketSession;
  private reconnectTimer: TimerHandle = null;
  private runtime: TransportLifecycleRuntimeRef;

  constructor(deps: TransportLifecycleServiceDeps) {
    this.deps = deps;
    this.runtime = deps.runtime;
    this.connectionBootstrap = new TransportConnectionBootstrap({
      createTransport: this.deps.createTransport,
    });
    this.socketSession = new TransportSocketSession();
    this.reliability = new TransportSocketReliabilityCoordinator({
      scheduler: this.deps.scheduler,
      dispatchEvent: this.deps.dispatchEvent,
      onSocketFailure: (failure) => {
        this.runtime.onSocketFailure(failure);
      },
      sendPing: () => {
        this.sendPayload(createPingMessage());
      },
      closeActive: (code, reason) => {
        return this.socketSession.closeActive(code, reason);
      },
    });
  }

  updateRuntime(nextRuntime: TransportLifecycleRuntimeRef): void {
    this.runtime = nextRuntime;
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
      this.reliability.reportSendFailure(error);
      return false;
    }
  };

  markPong = (): void => {
    this.reliability.markPong();
  };

  connect = (): void => {
    if (this.socketSession.hasActiveConnection()) {
      return;
    }

    this.deps.dispatchEvent({
      type: "set-connecting",
      reconnecting: this.runtime.hasSessionContext,
    });

    const bootstrapResult = this.connectionBootstrap.createSocket(
      this.runtime.wsUrl,
    );
    if (!bootstrapResult.ok) {
      this.reliability.reportBootstrapFailure(
        bootstrapResult.reasonCode,
        bootstrapResult.debugDetail,
        bootstrapResult.cause,
      );
      return;
    }

    const ws = bootstrapResult.socket;
    const socketGeneration = this.socketSession.attach(ws, {
      onOpen: () => {
        this.withCurrentSocket(ws, socketGeneration, () => {
          this.reliability.onConnected();
          this.deps.dispatchEvent({ type: "connected" });
          this.runtime.handlers.onOpen();
        });
      },
      onMessage: (event) => {
        this.withCurrentSocket(ws, socketGeneration, () => {
          this.runtime.handlers.onMessage(event);
        });
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
        return this.socketSession.closeActive(
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
          // Close old socket first to prevent stale listeners from firing
          // during the new connection setup.
          previousSocket.close(
            TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
            "endpoint changed",
          );
          // Then establish new connection with updated endpoint.
          this.connect();
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
        return this.socketSession.closeActive(
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
        return this.socketSession.closeActive(
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

  private onSocketError(
    socket: TerminalTransport,
    socketGeneration: number,
    event: TerminalTransportErrorEvent,
  ): void {
    this.withCurrentSocket(socket, socketGeneration, () => {
      this.reliability.handleSocketError(socketGeneration, event);
    });
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
    const closeReconciliation = this.reliability.handleSocketClose({
      socketGeneration,
    });
    executeTransportClosePlan(
      {
        closeIntent: closedSocket.closeIntent,
        closeCode: event.code,
        reconnectAttempt: this.deps.getState().reconnectAttempt,
        shouldReportCloseFailure: closeReconciliation.shouldReportCloseFailure,
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
          this.reliability.reportCloseFailure(event.code, event.reason);
        },
      },
    );
  }

  private withCurrentSocket(
    socket: TerminalTransport,
    generation: number,
    task: () => void,
  ): void {
    if (!this.socketSession.isCurrent(socket, generation)) {
      return;
    }
    task();
  }

  private executeLifecycleCommand(options: {
    clearReconnectAttempts?: boolean;
    tryClose: () => boolean;
    fallback: () => void;
  }): void {
    this.clearReconnectTimer();
    if (options.clearReconnectAttempts) {
      this.deps.dispatchEvent({ type: "clear-reconnect-attempts" });
    }
    this.reliability.clearLifecycleTimers();
    if (options.tryClose()) {
      return;
    }
    options.fallback();
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
