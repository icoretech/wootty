import type { TransportFailureReasonCode } from "../../../../contracts/transport/failure-reason";
import type { TerminalTransportErrorEvent } from "../../../../contracts/transport/transport";
import type { Scheduler } from "../../../../platform/scheduler";
import type { TransportFailureSink } from "../contracts/transport-failure-contract";
import {
  type ExecuteTransportClosePlanArgs,
  executeTransportClosePlan,
} from "../lifecycle/transport-close-plan-executor";
import { TERMINAL_CLOSE_CODE } from "../state/transport-policy";
import type {
  SocketCloseIntent,
  TransportEvent,
} from "../state/transport-state-machine";
import type { TransportBootstrapFailureReasonCode } from "../transport-connection-bootstrap";
import { TransportFailureReporter } from "./transport-failure-reporter";
import { TransportHeartbeatMonitor } from "./transport-heartbeat-monitor";

type ReportFailureArgs = {
  source: "close" | "error";
  code?: string | number;
  reasonCode?: TransportFailureReasonCode;
  technicalDetail?: string;
  cause?: unknown;
};

type HandleCloseArgs = {
  closeIntent: SocketCloseIntent;
  closeCode: number;
  closeReason: string;
  socketGeneration: number;
};

type TimerHandle = ReturnType<Scheduler["setTimeout"]> | null;

type TransportSocketReliabilityCoordinatorDeps = {
  scheduler: Scheduler;
  dispatchEvent: (event: TransportEvent) => void;
  onSocketFailure: TransportFailureSink;
  connect: () => void;
  getReconnectAttempt: () => number;
  sendPing: () => void;
  closeActive: (code: number, reason: string) => boolean;
};

function normalizeFailureReason(reason?: string): string {
  if (reason && reason.length > 0) {
    return reason;
  }
  return "transport send failed";
}

export class TransportSocketReliabilityCoordinator {
  private readonly heartbeatMonitor: TransportHeartbeatMonitor;
  private readonly failureReporter: TransportFailureReporter;
  private reconnectTimer: TimerHandle = null;
  private socketErrorGeneration: number | null = null;

  constructor(
    private readonly deps: TransportSocketReliabilityCoordinatorDeps,
  ) {
    this.heartbeatMonitor = new TransportHeartbeatMonitor({
      scheduler: this.deps.scheduler,
      onPing: () => {
        this.deps.sendPing();
      },
      onPongTimeout: () => {
        this.deps.closeActive(TERMINAL_CLOSE_CODE.PONG_TIMEOUT, "pong timeout");
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
        this.deps.onSocketFailure(failure);
      },
    });
  }

  onConnected(): void {
    this.socketErrorGeneration = null;
    this.failureReporter.reset();
    this.heartbeatMonitor.start();
  }

  markPong(): void {
    this.heartbeatMonitor.markPong();
  }

  clearLifecycleTimers(): void {
    this.heartbeatMonitor.stop();
    this.clearReconnectTimer();
  }

  reportSendFailure(error: unknown): void {
    const reason =
      error instanceof Error
        ? normalizeFailureReason(error.message)
        : "transport send failed";
    this.reportFailure({
      source: "error",
      reasonCode: "send_failed",
      technicalDetail: reason,
      cause: error,
    });
    this.deps.dispatchEvent({ type: "socket-error" });
  }

  handleSocketError(
    socketGeneration: number,
    event: TerminalTransportErrorEvent,
  ): void {
    this.socketErrorGeneration = socketGeneration;
    this.reportFailure({
      source: "error",
      code: event.code,
      reasonCode: "socket_failure",
      technicalDetail: event.message,
      cause: event.cause,
    });
    this.deps.dispatchEvent({ type: "socket-error" });
  }

  handleSocketClose({
    closeIntent,
    closeCode,
    closeReason,
    socketGeneration,
  }: HandleCloseArgs): void {
    this.clearLifecycleTimers();
    const shouldReportCloseFailure =
      this.socketErrorGeneration !== socketGeneration;
    const reconnectAttempt = this.deps.getReconnectAttempt();
    this.socketErrorGeneration = null;

    const closePlanArgs: ExecuteTransportClosePlanArgs = {
      closeIntent,
      closeCode,
      reconnectAttempt,
      shouldReportCloseFailure,
    };
    executeTransportClosePlan(closePlanArgs, {
      dispatchEvent: this.deps.dispatchEvent,
      connect: this.deps.connect,
      scheduleReconnect: (delayMs, task) => {
        this.scheduleReconnect(delayMs, task);
      },
      reportCloseFailure: () => {
        this.reportFailure({
          source: "close",
          code: closeCode,
          reasonCode: "socket_failure",
          technicalDetail: closeReason,
        });
      },
    });
  }

  reportBootstrapFailure(
    reasonCode: TransportBootstrapFailureReasonCode,
    debugDetail: string,
    cause?: unknown,
  ): void {
    this.reportFailure({
      source: "error",
      reasonCode,
      technicalDetail: debugDetail,
      cause,
    });
    this.deps.dispatchEvent({ type: "socket-error" });
  }

  private reportFailure(failure: ReportFailureArgs): void {
    this.failureReporter.report(failure);
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
