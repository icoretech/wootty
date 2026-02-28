type MessageListener = (event: { data?: string }) => void;
type Listener = (event?: unknown) => void;

export class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  readonly sent: string[] = [];

  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(_code?: number, _reason?: string): void {
    if (this.readyState >= MockWebSocket.CLOSING) {
      return;
    }

    this.readyState = MockWebSocket.CLOSING;
    this.emit("close", {});
    this.readyState = MockWebSocket.CLOSED;
  }

  triggerOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open", {});
  }

  triggerMessage(payload: object): void {
    const event = { data: JSON.stringify(payload) };
    const listeners = this.listeners.get("message") as
      | Set<MessageListener>
      | undefined;
    listeners?.forEach((listener) => {
      listener(event);
    });
  }

  private emit(type: string, event: unknown): void {
    this.listeners.get(type)?.forEach((listener) => {
      listener(event);
    });
  }
}

export function sentMessages(
  ws: MockWebSocket,
): Array<Record<string, unknown>> {
  return ws.sent.map((entry) => JSON.parse(entry) as Record<string, unknown>);
}
