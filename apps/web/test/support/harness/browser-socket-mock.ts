import type { TerminalTransportEventType } from "../../../src/features/terminal/contracts/transport";

type BrowserSocketEvent = Event | Record<string, unknown>;
type Listener = (event: BrowserSocketEvent) => void;

export class BrowserSocketMock {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = BrowserSocketMock.CONNECTING;
  readonly sent: string[] = [];

  private readonly listeners: Record<
    TerminalTransportEventType,
    Set<Listener>
  > = {
    open: new Set(),
    message: new Set(),
    close: new Set(),
    error: new Set(),
  };

  constructor(readonly url: string) {}

  addEventListener(type: TerminalTransportEventType, listener: Listener): void {
    this.listeners[type].add(listener);
  }

  removeEventListener(
    type: TerminalTransportEventType,
    listener: Listener,
  ): void {
    this.listeners[type].delete(listener);
  }

  send(data: string): void {
    if (this.readyState !== BrowserSocketMock.OPEN) {
      throw new Error("InvalidStateError");
    }
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    if (this.readyState >= BrowserSocketMock.CLOSING) {
      return;
    }
    this.readyState = BrowserSocketMock.CLOSING;
    this.emit("close", new CloseEvent("close", { code, reason }));
    this.readyState = BrowserSocketMock.CLOSED;
  }

  triggerOpen(): void {
    this.readyState = BrowserSocketMock.OPEN;
    this.emit("open", new Event("open"));
  }

  triggerMessage(payload: unknown): void {
    const data =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    this.emit("message", new MessageEvent("message", { data }));
  }

  triggerError(message = "transport error", code?: string): void {
    if (code && code.length > 0) {
      this.emit("error", { message, code });
      return;
    }
    this.emit("error", new ErrorEvent("error", { message }));
  }

  emit(type: TerminalTransportEventType, event: BrowserSocketEvent): void {
    this.listeners[type].forEach((listener) => {
      listener(event);
    });
  }
}

type BrowserSocketMockHarness = {
  readonly instances: BrowserSocketMock[];
  createSocket: (url: string) => BrowserSocketMock;
  reset: () => void;
};

export function createBrowserSocketMockHarness(): BrowserSocketMockHarness {
  const instances: BrowserSocketMock[] = [];

  return {
    instances,
    createSocket: (url) => {
      const socket = new BrowserSocketMock(url);
      instances.push(socket);
      return socket;
    },
    reset: () => {
      instances.length = 0;
    },
  };
}
