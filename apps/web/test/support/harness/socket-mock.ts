import type {
  TerminalTransport,
  TerminalTransportCloseEvent,
  TerminalTransportErrorEvent,
  TerminalTransportEventMap,
  TerminalTransportEventType,
  TerminalTransportListener,
  TerminalTransportMessageEvent,
  TerminalTransportOpenEvent,
  TerminalTransportReadyState,
} from "../../../src/features/terminal/contracts/transport";
import { TRANSPORT_READY_STATE } from "../../../src/features/terminal/contracts/transport";
import type { TerminalTransportBoundary } from "./terminal-boundary";

type OpenListener = TerminalTransportListener<"open">;
type CloseListener = TerminalTransportListener<"close">;
type ErrorListener = TerminalTransportListener<"error">;
type MessageListener = TerminalTransportListener<"message">;
type ListenerMap = {
  [K in TerminalTransportEventType]: Set<TerminalTransportListener<K>>;
};

export interface WebSocketMock {
  readyState: TerminalTransportReadyState;
  readonly url: string;
  readonly sent: string[];
  close: (code?: number, reason?: string) => void;
  triggerOpen: () => void;
  triggerMessage: (payload: unknown) => void;
  triggerError: (message?: string) => void;
  send: (data: string) => void;
}

export type WebSocketMockHarness = {
  readonly instances: WebSocketMock[];
  createTransport: (url: string) => TerminalTransport;
  reset: () => void;
  sentMessages: (ws: WebSocketMock) => Array<Record<string, unknown>>;
} & TerminalTransportBoundary;

export function createWebSocketMockHarness(): WebSocketMockHarness {
  const instances: WebSocketMock[] = [];

  const createInvalidStateError = () => {
    if (typeof DOMException !== "undefined") {
      return new DOMException(
        "WebSocket is not open: readyState is not OPEN.",
        "InvalidStateError",
      );
    }

    const error = new Error("WebSocket is not open: readyState is not OPEN.");
    error.name = "InvalidStateError";
    return error;
  };

  class MockWebSocket implements WebSocketMock {
    readyState = TRANSPORT_READY_STATE.CONNECTING;
    readonly sent: string[] = [];

    private readonly listeners: ListenerMap = {
      open: new Set<OpenListener>(),
      close: new Set<CloseListener>(),
      error: new Set<ErrorListener>(),
      message: new Set<MessageListener>(),
    };

    constructor(readonly url: string) {
      instances.push(this);
    }

    addEventListener<T extends TerminalTransportEventType>(
      type: T,
      listener: TerminalTransportListener<T>,
    ): void {
      this.listeners[type].add(listener);
    }

    removeEventListener<T extends TerminalTransportEventType>(
      type: T,
      listener: TerminalTransportListener<T>,
    ): void {
      this.listeners[type].delete(listener);
    }

    send(data: string): void {
      if (this.readyState !== TRANSPORT_READY_STATE.OPEN) {
        throw createInvalidStateError();
      }
      this.sent.push(data);
    }

    close(code = 1000, reason = "normal"): void {
      if (this.readyState >= TRANSPORT_READY_STATE.CLOSING) {
        return;
      }

      this.readyState = TRANSPORT_READY_STATE.CLOSING;
      this.emitClose(code, reason);
      this.readyState = TRANSPORT_READY_STATE.CLOSED;
    }

    triggerOpen(): void {
      this.readyState = TRANSPORT_READY_STATE.OPEN;
      const event: TerminalTransportOpenEvent = {};
      this.emit("open", event);
    }

    triggerMessage(payload: unknown): void {
      const data =
        typeof payload === "string" ? payload : JSON.stringify(payload);
      const event: TerminalTransportMessageEvent = {
        data,
      };
      this.emit("message", event);
    }

    triggerError(message = "socket error"): void {
      const event: TerminalTransportErrorEvent = {
        source: "transport",
        message,
      };
      this.emit("error", event);
    }

    private emitClose(code: number, reason: string): void {
      const event: TerminalTransportCloseEvent = { code, reason };
      this.emit("close", event);
    }

    private emit<T extends TerminalTransportEventType>(
      type: T,
      event: TerminalTransportEventMap[T],
    ): void {
      this.listeners[type].forEach((listener) => {
        listener(event);
      });
    }
  }

  return {
    instances,
    createTransport: (url) => {
      return new MockWebSocket(url);
    },
    reset: () => {
      instances.length = 0;
    },
    sentMessages: (ws) => {
      return ws.sent.map(
        (entry) => JSON.parse(entry) as Record<string, unknown>,
      );
    },
  };
}
