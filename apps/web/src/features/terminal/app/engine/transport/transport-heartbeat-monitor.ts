import type {
  Scheduler,
  SchedulerTimerHandle,
} from "../../../platform/scheduler";
import { TERMINAL_HEARTBEAT_MS } from "./transport-policy";

type TimerHandle = SchedulerTimerHandle | null;

type TransportHeartbeatMonitorDeps = {
  scheduler: Scheduler;
  onPing: () => void;
  onPongTimeout: () => void;
  onLatency: (latencyMs: number) => void;
};

export class TransportHeartbeatMonitor {
  private readonly deps: TransportHeartbeatMonitorDeps;
  private pingTimer: TimerHandle = null;
  private pongTimeout: TimerHandle = null;
  private pingSentAt: number | null = null;

  constructor(deps: TransportHeartbeatMonitorDeps) {
    this.deps = deps;
  }

  start(): void {
    this.stop();
    this.pingTimer = this.deps.scheduler.setInterval(() => {
      this.pingSentAt = this.deps.scheduler.now();
      this.deps.onPing();
      this.clearPongTimeout();
      this.pongTimeout = this.deps.scheduler.setTimeout(() => {
        this.deps.onPongTimeout();
      }, TERMINAL_HEARTBEAT_MS.PONG_TIMEOUT);
    }, TERMINAL_HEARTBEAT_MS.INTERVAL);
  }

  markPong(): void {
    if (this.pingSentAt !== null) {
      this.deps.onLatency(this.deps.scheduler.now() - this.pingSentAt);
      this.pingSentAt = null;
    }
    this.clearPongTimeout();
  }

  stop(): void {
    if (this.pingTimer !== null) {
      this.deps.scheduler.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.clearPongTimeout();
  }

  private clearPongTimeout(): void {
    if (this.pongTimeout !== null) {
      this.deps.scheduler.clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }
}
