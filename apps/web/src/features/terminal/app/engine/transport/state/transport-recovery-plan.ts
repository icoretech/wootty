import {
  isRecoverableTransportClose,
  reconnectDelayMs,
  TERMINAL_RECONNECT_POLICY,
} from "./transport-policy";
import type { SocketCloseIntent } from "./transport-state-machine";

type TransportClosePlan =
  | { kind: "disposed" }
  | { kind: "reconnect-immediate" }
  | { kind: "nonrecoverable" }
  | { kind: "reconnect-exhausted"; attempt: number }
  | { kind: "schedule-reconnect"; nextAttempt: number; delayMs: number };

type ResolveTransportClosePlanArgs = {
  closeIntent: SocketCloseIntent;
  closeCode: number;
  reconnectAttempt: number;
};

export function resolveTransportClosePlan({
  closeIntent,
  closeCode,
  reconnectAttempt,
}: ResolveTransportClosePlanArgs): TransportClosePlan {
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
