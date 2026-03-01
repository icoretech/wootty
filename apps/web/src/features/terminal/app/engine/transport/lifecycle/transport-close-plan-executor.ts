import {
  isRecoverableTransportClose,
  reconnectDelayMs,
  TERMINAL_RECONNECT_POLICY,
} from "../state/transport-policy";
import type {
  SocketCloseIntent,
  TransportEvent,
} from "../state/transport-state-machine";

type TransportClosePlan =
  | { kind: "disposed" }
  | { kind: "reconnect-immediate" }
  | { kind: "nonrecoverable" }
  | { kind: "reconnect-exhausted"; attempt: number }
  | { kind: "schedule-reconnect"; nextAttempt: number; delayMs: number };

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

export function resolveTransportClosePlan({
  closeIntent,
  closeCode,
  reconnectAttempt,
}: {
  closeIntent: SocketCloseIntent;
  closeCode: number;
  reconnectAttempt: number;
}): TransportClosePlan {
  if (closeIntent === "dispose") {
    return { kind: "disposed" };
  }
  if (closeIntent === "fresh" || closeIntent === "manual") {
    return { kind: "reconnect-immediate" };
  }
  if (!isRecoverableTransportClose(closeCode)) {
    return { kind: "nonrecoverable" };
  }
  if (reconnectAttempt >= TERMINAL_RECONNECT_POLICY.MAX_ATTEMPTS) {
    return {
      kind: "reconnect-exhausted",
      attempt: reconnectAttempt,
    };
  }
  return {
    kind: "schedule-reconnect",
    nextAttempt: reconnectAttempt + 1,
    delayMs: reconnectDelayMs(reconnectAttempt),
  };
}

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
      context: {
        source: "close",
        reasonCode: "socket_failure",
        technicalDetail: `reconnect exhausted attempts=${closePlan.attempt}`,
      },
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
