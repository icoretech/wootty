import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type TerminalTransportEventType,
  TRANSPORT_READY_STATE,
} from "../../../src/features/terminal/contracts/transport";
import { createBrowserTransport } from "../../../src/features/terminal/orchestration/browser-transport";
import { runTransportContractSuite } from "../../support/harness/transport-contract-suite";

type Listener = (event: Event) => void;

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
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

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

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
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error("InvalidStateError");
    }
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = FakeWebSocket.CLOSING;
    this.emit("close", new CloseEvent("close", { code, reason }));
    this.readyState = FakeWebSocket.CLOSED;
  }

  emit(type: TerminalTransportEventType, event: Event): void {
    this.listeners[type].forEach((listener) => {
      listener(event);
    });
  }
}

afterEach(() => {
  FakeWebSocket.instances.length = 0;
});

runTransportContractSuite("browser transport contract", () => {
  const transport = createBrowserTransport(
    "ws://localhost",
    (url) => new FakeWebSocket(url),
  );
  const raw = FakeWebSocket.instances[0];
  if (!raw) {
    throw new Error("browser transport socket was not created");
  }

  return {
    transport,
    open: () => {
      raw.readyState = FakeWebSocket.OPEN;
      raw.emit("open", new Event("open"));
    },
    emitMessage: (payload) => {
      const data =
        typeof payload === "string" ? payload : JSON.stringify(payload);
      raw.emit("message", new MessageEvent("message", { data }));
    },
    emitError: (message) => {
      raw.emit("error", new ErrorEvent("error", { message }));
    },
    sent: () => raw.sent,
  };
});

describe("browser transport adapter", () => {
  it("maps native ready states and close behavior", () => {
    const transport = createBrowserTransport(
      "ws://localhost",
      (url) => new FakeWebSocket(url),
    );
    const raw = FakeWebSocket.instances[0];
    expect(raw?.readyState).toBe(FakeWebSocket.CONNECTING);
    expect(transport.readyState).toBe(TRANSPORT_READY_STATE.CONNECTING);

    if (!raw) {
      throw new Error("browser transport socket was not created");
    }

    raw.readyState = FakeWebSocket.OPEN;
    expect(transport.readyState).toBe(TRANSPORT_READY_STATE.OPEN);
    expect(raw.sent).toEqual([]);

    transport.close(4101, "manual reconnect");
    expect(transport.readyState).toBe(TRANSPORT_READY_STATE.CLOSED);
  });

  it("normalizes malformed message and close events", () => {
    const transport = createBrowserTransport(
      "ws://localhost",
      (url) => new FakeWebSocket(url),
    );
    const raw = FakeWebSocket.instances[0];
    if (!raw) {
      throw new Error("browser transport socket was not created");
    }

    const onMessage = vi.fn();
    const onClose = vi.fn();
    transport.addEventListener("message", onMessage);
    transport.addEventListener("close", onClose);

    raw.emit("message", new MessageEvent("message", { data: { bad: true } }));
    raw.emit("close", new Event("close"));

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ data: "" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({ code: 1006, reason: "" });
  });

  it("removes listeners using the same callback reference", () => {
    const transport = createBrowserTransport(
      "ws://localhost",
      (url) => new FakeWebSocket(url),
    );
    const raw = FakeWebSocket.instances[0];
    if (!raw) {
      throw new Error("browser transport socket was not created");
    }

    const onError = vi.fn();
    transport.addEventListener("error", onError);
    transport.removeEventListener("error", onError);
    raw.emit("error", new ErrorEvent("error", { message: "boom" }));
    expect(raw.readyState).toBe(FakeWebSocket.CONNECTING);

    expect(onError).not.toHaveBeenCalled();
  });

  it("deduplicates repeated callback registration per event type", () => {
    const transport = createBrowserTransport(
      "ws://localhost",
      (url) => new FakeWebSocket(url),
    );
    const raw = FakeWebSocket.instances[0];
    if (!raw) {
      throw new Error("browser transport socket was not created");
    }

    const onMessage = vi.fn();
    transport.addEventListener("message", onMessage);
    transport.addEventListener("message", onMessage);
    raw.emit("message", new MessageEvent("message", { data: "hello" }));
    expect(onMessage).toHaveBeenCalledTimes(1);

    transport.removeEventListener("message", onMessage);
    raw.emit("message", new MessageEvent("message", { data: "hello-again" }));
    expect(onMessage).toHaveBeenCalledTimes(1);
  });
});
