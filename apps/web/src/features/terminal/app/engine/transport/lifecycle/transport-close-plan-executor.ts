import { resolveTransportClosePlan } from "../state/transport-recovery-plan";
import type {
  SocketCloseIntent,
  TransportEvent,
} from "../state/transport-state-machine";

type TransportClosePlanExecutorDeps = {
  dispatchEvent: (event: TransportEvent) => void;
  connect: () => void;
  scheduleReconnect: (delayMs: number, task: () => void) => void;
  reportCloseFailure: () => void;
};

type ExecuteTransportClosePlanArgs = {
  closeIntent: SocketCloseIntent;
  closeCode: number;
  reconnectAttempt: number;
  shouldReportCloseFailure: boolean;
};

export function executeTransportClosePlan(
  {
    closeIntent,
    closeCode,
    reconnectAttempt,
    shouldReportCloseFailure,
  }: ExecuteTransportClosePlanArgs,
  deps: TransportClosePlanExecutorDeps,
): void {
  const closePlan = resolveTransportClosePlan({
    closeIntent,
    closeCode,
    reconnectAttempt,
  });

  if (closePlan.kind === "disposed") {
    deps.dispatchEvent({ type: "socket-closed" });
    return;
  }

  if (closePlan.kind === "reconnect-immediate") {
    deps.dispatchEvent({ type: "set-connecting", reconnecting: false });
    deps.connect();
    return;
  }

  if (shouldReportCloseFailure) {
    deps.reportCloseFailure();
  }

  if (closePlan.kind === "nonrecoverable") {
    deps.dispatchEvent({ type: "socket-error" });
    return;
  }

  if (closePlan.kind === "reconnect-exhausted") {
    deps.dispatchEvent({
      type: "socket-failure",
      context: `close reason=reconnect exhausted attempts=${closePlan.attempt}`,
    });
    deps.dispatchEvent({ type: "socket-error" });
    return;
  }

  deps.dispatchEvent({
    type: "schedule-reconnect",
    attempt: closePlan.nextAttempt,
  });
  deps.scheduleReconnect(closePlan.delayMs, () => {
    deps.connect();
  });
}
