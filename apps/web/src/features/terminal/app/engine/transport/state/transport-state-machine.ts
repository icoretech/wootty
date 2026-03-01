import type { ConnectionStatus } from "../../../../contracts/connection";
import { assertNever } from "../../../../lib/assert-never";

export type SocketCloseIntent = "normal" | "fresh" | "manual" | "dispose";

export type TransportFailureContext = {
  source: "error" | "close";
  reasonCode?: string;
  code?: string | number;
  technicalDetail?: string;
};

export type TransportState = {
  status: ConnectionStatus;
  reconnectAttempt: number;
  latencyMs: number | null;
  lastSocketFailure: TransportFailureContext | null;
  closeIntent: SocketCloseIntent;
};

export const initialTransportState: TransportState = {
  status: "connecting",
  reconnectAttempt: 0,
  latencyMs: null,
  lastSocketFailure: null,
  closeIntent: "normal",
};

export type TransportEvent =
  | { type: "set-close-intent"; intent: SocketCloseIntent }
  | { type: "set-connecting"; reconnecting: boolean }
  | { type: "connected" }
  | { type: "socket-closed" }
  | { type: "socket-error" }
  | { type: "latency"; latencyMs: number }
  | { type: "socket-failure"; context: TransportFailureContext }
  | { type: "schedule-reconnect"; attempt: number }
  | { type: "clear-reconnect-attempts" };

export function reduceTransportState(
  state: TransportState,
  event: TransportEvent,
): TransportState {
  switch (event.type) {
    case "set-close-intent":
      return {
        ...state,
        closeIntent: event.intent,
      };
    case "set-connecting":
      return {
        ...state,
        status: event.reconnecting ? "reconnecting" : "connecting",
        closeIntent: "normal",
      };
    case "connected":
      return {
        ...state,
        status: "connected",
        reconnectAttempt: 0,
        latencyMs: null,
        lastSocketFailure: null,
        closeIntent: "normal",
      };
    case "socket-closed":
      return {
        ...state,
        status: "closed",
        closeIntent: "normal",
      };
    case "socket-error":
      return {
        ...state,
        status: "error",
        closeIntent: "normal",
      };
    case "latency":
      return {
        ...state,
        latencyMs: event.latencyMs,
      };
    case "socket-failure":
      return {
        ...state,
        lastSocketFailure: event.context,
      };
    case "schedule-reconnect":
      return {
        ...state,
        status: "reconnecting",
        reconnectAttempt: event.attempt,
        closeIntent: "normal",
      };
    case "clear-reconnect-attempts":
      return {
        ...state,
        reconnectAttempt: 0,
      };
    default:
      return assertNever(event);
  }
}
