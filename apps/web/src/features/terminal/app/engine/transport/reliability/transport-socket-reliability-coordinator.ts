import type { TransportFailureReasonCode } from "../../../../contracts/transport/failure-reason";
import type { TerminalTransportErrorEvent } from "../../../../contracts/transport/transport";
import type { Scheduler } from "../../../../platform/scheduler";
import type { TransportFailureSink } from "../contracts/transport-failure-contract";
import { TERMINAL_CLOSE_CODE } from "../state/transport-policy";
import type { TransportEvent } from "../state/transport-state-machine";
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
  socketGeneration: number;
};

type TransportSocketReliabilityCoordinatorDeps = {
  scheduler: Scheduler;
  dispatchEvent: (event: TransportEvent) => void;
  onSocketFailure: TransportFailureSink;
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

  handleSocketClose({ socketGeneration }: HandleCloseArgs): {
    shouldReportCloseFailure: boolean;
  } {
    this.heartbeatMonitor.stop();
    const shouldReportCloseFailure =
      this.socketErrorGeneration !== socketGeneration;
    this.socketErrorGeneration = null;
    return { shouldReportCloseFailure };
  }

  reportCloseFailure(closeCode: number, closeReason: string): void {
    this.reportFailure({
      source: "close",
      code: closeCode,
      reasonCode: "socket_failure",
      technicalDetail: closeReason,
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
}
