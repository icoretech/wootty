import type {
  Scheduler,
  SchedulerTimerHandle,
} from "../../../../platform/scheduler";
import type {
  SocketCloseIntent,
  TransportEvent,
} from "../state/transport-state-machine";
import { executeTransportClosePlan } from "./transport-close-plan-executor";

type TimerHandle = SchedulerTimerHandle | null;

type TransportCloseCoordinatorDeps = {
  scheduler: Scheduler;
  dispatchEvent: (event: TransportEvent) => void;
  connect: () => void;
  reportCloseFailure: (closeCode: number, closeReason: string) => void;
};

type HandleSocketCloseArgs = {
  closeIntent: SocketCloseIntent;
  closeCode: number;
  closeReason: string;
  reconnectAttempt: number;
  shouldReportCloseFailure: boolean;
};

export class TransportCloseCoordinator {
  private readonly deps: TransportCloseCoordinatorDeps;
  private reconnectTimer: TimerHandle = null;

  constructor(deps: TransportCloseCoordinatorDeps) {
    this.deps = deps;
  }

  handleSocketClose({
    closeIntent,
    closeCode,
    closeReason,
    reconnectAttempt,
    shouldReportCloseFailure,
  }: HandleSocketCloseArgs): void {
    executeTransportClosePlan(
      {
        closeIntent,
        closeCode,
        reconnectAttempt,
        shouldReportCloseFailure,
      },
      {
        dispatchEvent: this.deps.dispatchEvent,
        connect: this.deps.connect,
        scheduleReconnect: (delayMs, task) => {
          this.scheduleReconnect(delayMs, task);
        },
        reportCloseFailure: () => {
          this.deps.reportCloseFailure(closeCode, closeReason);
        },
      },
    );
  }

  clearReconnectTimer(): void {
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
