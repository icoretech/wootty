import type {
  Scheduler,
  SchedulerTimerHandle,
} from "../../../platform/scheduler";

type TimerHandle = SchedulerTimerHandle | null;

type TransportReconnectControllerDeps = {
  scheduler: Scheduler;
};

export class TransportReconnectController {
  private readonly deps: TransportReconnectControllerDeps;
  private reconnectTimer: TimerHandle = null;
  private closedByUser = false;
  private pendingFreshConnect = false;
  private socketErrorSinceConnect = false;

  constructor(deps: TransportReconnectControllerDeps) {
    this.deps = deps;
  }

  markSocketOpened(): void {
    this.socketErrorSinceConnect = false;
  }

  markSocketError(): void {
    this.socketErrorSinceConnect = true;
  }

  consumeShouldReportCloseFailure(): boolean {
    const shouldReport = !this.socketErrorSinceConnect;
    this.socketErrorSinceConnect = false;
    return shouldReport;
  }

  beginReconnect(): void {
    this.closedByUser = false;
    this.pendingFreshConnect = false;
  }

  beginFreshConnect(): void {
    this.closedByUser = false;
    this.pendingFreshConnect = true;
  }

  consumePendingFreshConnect(): boolean {
    if (!this.pendingFreshConnect) {
      return false;
    }
    this.pendingFreshConnect = false;
    return true;
  }

  beginDispose(): void {
    this.closedByUser = true;
    this.pendingFreshConnect = false;
    this.socketErrorSinceConnect = false;
  }

  isClosedByUser(): boolean {
    return this.closedByUser;
  }

  clearUserCloseMarker(): void {
    this.closedByUser = false;
  }

  clearReconnectTimer(): void {
    if (this.reconnectTimer === null) {
      return;
    }
    this.deps.scheduler.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  scheduleReconnect(delayMs: number, task: () => void): void {
    this.clearReconnectTimer();
    this.reconnectTimer = this.deps.scheduler.setTimeout(() => {
      this.reconnectTimer = null;
      task();
    }, delayMs);
  }
}
