export const TRANSPORT_READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

export type TerminalTransportReadyState =
  (typeof TRANSPORT_READY_STATE)[keyof typeof TRANSPORT_READY_STATE];

export type TerminalTransportOpenEvent = Record<string, never>;
export type TerminalTransportMessageEvent = {
  readonly data: string;
  readonly malformed?: string;
};
export type TerminalTransportFailureCode = string | number;
export type TerminalTransportCloseEvent = {
  readonly code: number;
  readonly reason: string;
};
export type TerminalTransportErrorEvent = {
  readonly source: "transport";
  readonly message: string;
  readonly code?: TerminalTransportFailureCode;
  readonly cause?: unknown;
};

export type TerminalTransportEventMap = {
  open: TerminalTransportOpenEvent;
  message: TerminalTransportMessageEvent;
  close: TerminalTransportCloseEvent;
  error: TerminalTransportErrorEvent;
};

export type TerminalTransportEventType = keyof TerminalTransportEventMap;
export type TerminalTransportListener<T extends TerminalTransportEventType> = (
  event: TerminalTransportEventMap[T],
) => void;

export interface TerminalTransport {
  readonly readyState: TerminalTransportReadyState;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener<T extends TerminalTransportEventType>(
    type: T,
    listener: TerminalTransportListener<T>,
  ): void;
  removeEventListener<T extends TerminalTransportEventType>(
    type: T,
    listener: TerminalTransportListener<T>,
  ): void;
}
