import {
  type TerminalTransport,
  type TerminalTransportCloseEvent,
  type TerminalTransportErrorEvent,
  type TerminalTransportEventMap,
  type TerminalTransportEventType,
  type TerminalTransportListener,
  type TerminalTransportMessageEvent,
  TRANSPORT_READY_STATE,
} from "../../../src/features/terminal/contracts/transport/transport";

export class FakeTransport implements TerminalTransport {
  readyState = TRANSPORT_READY_STATE.CONNECTING;
  sentPayloads: string[] = [];
  closeCalls: Array<{ code: number; reason: string }> = [];
  private listeners: {
    [K in TerminalTransportEventType]: Set<TerminalTransportListener<K>>;
  } = {
    open: new Set(),
    message: new Set(),
    close: new Set(),
    error: new Set(),
  };

  send(data: string): void {
    this.sentPayloads.push(data);
  }

  close(code?: number, reason?: string): void {
    const closeCode = code ?? 1000;
    const closeReason = reason ?? "";
    this.closeCalls.push({ code: closeCode, reason: closeReason });
    this.emitClose(closeCode, closeReason);
  }

  addEventListener<T extends TerminalTransportEventType>(
    type: T,
    listener: TerminalTransportListener<T>,
  ): void {
    this.listenerSet(type).add(listener);
  }

  removeEventListener<T extends TerminalTransportEventType>(
    type: T,
    listener: TerminalTransportListener<T>,
  ): void {
    this.listenerSet(type).delete(listener);
  }

  emitOpen(): void {
    this.readyState = TRANSPORT_READY_STATE.OPEN;
    this.emit("open", {});
  }

  emitMessage(event: TerminalTransportMessageEvent): void {
    this.emit("message", event);
  }

  emitError(
    message: string,
    options?: {
      code?: string | number;
      cause?: unknown;
    },
  ): void {
    const event: TerminalTransportErrorEvent = {
      source: "transport",
      message,
      code: options?.code,
      cause: options?.cause,
    };
    this.emit("error", event);
  }

  emitClose(code: number, reason: string): void {
    this.readyState = TRANSPORT_READY_STATE.CLOSED;
    const event: TerminalTransportCloseEvent = { code, reason };
    this.emit("close", event);
  }

  private emit<T extends TerminalTransportEventType>(
    type: T,
    event: TerminalTransportEventMap[T],
  ): void {
    for (const listener of this.listenerSet(type)) {
      listener(event);
    }
  }

  private listenerSet<T extends TerminalTransportEventType>(
    type: T,
  ): Set<TerminalTransportListener<T>> {
    return this.listeners[type];
  }
}
