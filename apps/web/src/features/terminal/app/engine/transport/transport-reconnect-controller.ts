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

  constructor(deps: TransportReconnectControllerDeps) {
    this.deps = deps;
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
